/**
 * HUD module — Fair Market Rents, Income Limits, geographic lookups
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import {
  listStates,
  listCounties,
  listMetroAreas,
  getFairMarketRents,
  getStateFairMarketRents,
  getIncomeLimits,
  getStateIncomeLimits,
  clearCache as sdkClearCache,
} from "../sdk/hud.js";
import { listResponse, recordResponse, emptyResponse } from "../response.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "hud";
export const displayName = "HUD";
export const description =
  "Department of Housing and Urban Development — Fair Market Rents (FMR) by bedroom count, Income Limits by household size for counties and metro areas. Essential for affordable housing, Section 8 vouchers, and housing cost analysis.";
export const auth = {
  envVar: "HUD_USER_TOKEN",
  signup: "https://www.huduser.gov/hudapi/public/register",
};
export const workflow =
  "Use hud_list_states to get state codes → hud_list_counties to find county FIPS codes → hud_fair_market_rents for rental data → hud_income_limits for income thresholds.";
export const tips =
  "Entity IDs are county FIPS codes (e.g. '0600000001' for a CA county). Use hud_list_counties to find them. State-level tools accept two-letter codes (CA, TX). FMR data shows HUD-determined fair rents used for Section 8 voucher amounts. Income Limits show Very Low, Extremely Low, and Low income thresholds by household size (1-8 persons).";

// ─── Helpers ─────────────────────────────────────────────────────────

function fmrToRecord(data: Record<string, unknown>): Record<string, unknown> {
  const basic = data.basicdata as Record<string, unknown> | undefined;
  const source = basic ?? data;

  return {
    area_name: source.area_name ?? source.county_name ?? source.metro_name ?? "Unknown area",
    year: source.year ?? data.year ?? null,
    efficiency: source.Efficiency ?? source.efficiency ?? source.rent_eff ?? null,
    oneBedroom: source["One-Bedroom"] ?? source.one_bedroom ?? source.rent_1br ?? null,
    twoBedroom: source["Two-Bedroom"] ?? source.two_bedroom ?? source.rent_2br ?? null,
    threeBedroom: source["Three-Bedroom"] ?? source.three_bedroom ?? source.rent_3br ?? null,
    fourBedroom: source["Four-Bedroom"] ?? source.four_bedroom ?? source.rent_4br ?? null,
  };
}

function incomeLimitsToRecord(data: Record<string, unknown>): Record<string, unknown> {
  return {
    area_name: data.area_name ?? data.county_name ?? data.metro_name ?? "Unknown area",
    year: data.year ?? null,
    median_income: data.median_income ?? data.median ?? null,
    very_low: data.very_low ?? null,
    extremely_low: data.extremely_low ?? null,
    low: data.low ?? null,
  };
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "hud_fair_market_rents",
    description:
      "Get HUD Fair Market Rents (FMR) for a county, metro area, or entire state. Shows monthly rent by bedroom count (efficiency through 4-bedroom). FMR determines Section 8 voucher amounts.",
    annotations: { title: "HUD Fair Market Rents", readOnlyHint: true },
    parameters: z.object({
      state: z.string().max(2).optional().describe("Two-letter state code for state-wide FMR data (e.g. CA, TX)"),
      entity_id: z.string().optional().describe("County FIPS or CBSA code for specific area FMR (get from hud_list_counties)"),
      year: z.number().optional().describe("Fiscal year (e.g. 2024). Defaults to current year."),
    }),
    execute: async (args) => {
      let data: Record<string, unknown>;
      if (args.entity_id) {
        data = await getFairMarketRents(args.entity_id, args.year);
      } else if (args.state) {
        data = await getStateFairMarketRents(args.state, args.year);
      } else {
        return emptyResponse("Provide either state or entity_id.");
      }

      // Handle state data which may return an array
      if (Array.isArray(data)) {
        const items = data.map((item: any) => fmrToRecord(item));
        return listResponse(`Fair Market Rents: ${items.length} area(s)`, { items, total: data.length });
      }

      const record = fmrToRecord(data);
      return recordResponse(`Fair Market Rents — ${record.area_name}`, record);
    },
  },
  {
    name: "hud_income_limits",
    description:
      "Get HUD Income Limits for a county, metro area, or entire state. Shows Very Low, Extremely Low, and Low income thresholds by household size (1-8 persons). Used for affordable housing eligibility.",
    annotations: { title: "HUD Income Limits", readOnlyHint: true },
    parameters: z.object({
      state: z.string().max(2).optional().describe("Two-letter state code for state-wide income limits"),
      entity_id: z.string().optional().describe("County FIPS or CBSA code (get from hud_list_counties)"),
      year: z.number().optional().describe("Fiscal year (e.g. 2024). Defaults to current year."),
    }),
    execute: async (args) => {
      let data: Record<string, unknown>;
      if (args.entity_id) {
        data = await getIncomeLimits(args.entity_id, args.year);
      } else if (args.state) {
        data = await getStateIncomeLimits(args.state, args.year);
      } else {
        return emptyResponse("Provide either state or entity_id.");
      }

      if (Array.isArray(data)) {
        const items = data.map((item: any) => incomeLimitsToRecord(item));
        return listResponse(`Income Limits: ${items.length} area(s)`, { items, total: data.length });
      }

      const record = incomeLimitsToRecord(data);
      return recordResponse(`Income Limits — ${record.area_name}`, record);
    },
  },
  {
    name: "hud_list_states",
    description: "List all U.S. states with their HUD state codes. Use these codes with other HUD tools.",
    annotations: { title: "HUD States", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const states = await listStates();
      if (!states.length) return emptyResponse("No states returned.");
      return listResponse(`${states.length} U.S. state(s)`, { items: states.map(s => ({ ...s })), total: states.length });
    },
  },
  {
    name: "hud_list_counties",
    description: "List counties in a state with their FIPS codes. Use FIPS codes as entity_id in hud_fair_market_rents and hud_income_limits.",
    annotations: { title: "HUD Counties", readOnlyHint: true },
    parameters: z.object({
      state: z.string().max(2).describe("Two-letter state code (e.g. CA, TX, NY)"),
    }),
    execute: async (args) => {
      const counties = await listCounties(args.state);
      if (!counties.length) return emptyResponse(`No counties found for state '${args.state}'.`);
      return listResponse(
        `${counties.length} county/area(s) in ${args.state.toUpperCase()}`,
        { items: counties.map(c => ({ ...c })), total: counties.length },
      );
    },
  },
  {
    name: "hud_list_metro_areas",
    description: "List metropolitan/CBSA areas. CBSA codes can be used as entity_id in HUD tools.",
    annotations: { title: "HUD Metro Areas", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const areas = await listMetroAreas();
      if (!areas.length) return emptyResponse("No metro areas returned.");
      return listResponse(
        `${areas.length} metro area(s)`,
        { items: areas.map(a => ({ ...a })), total: areas.length },
      );
    },
  },
];

export { sdkClearCache as clearCache };

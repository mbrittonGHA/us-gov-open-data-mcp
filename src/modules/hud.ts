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

function formatFmr(data: Record<string, unknown>): string {
  const basic = data.basicdata as Record<string, unknown> | undefined;
  const source = basic ?? data;

  const name = source.area_name ?? source.county_name ?? source.metro_name ?? "Unknown area";
  const year = source.year ?? data.year ?? "?";

  // Try to find rent values from various possible field names
  const eff = source.Efficiency ?? source.efficiency ?? source.rent_eff ?? "N/A";
  const br1 = source["One-Bedroom"] ?? source.one_bedroom ?? source.rent_1br ?? "N/A";
  const br2 = source["Two-Bedroom"] ?? source.two_bedroom ?? source.rent_2br ?? "N/A";
  const br3 = source["Three-Bedroom"] ?? source.three_bedroom ?? source.rent_3br ?? "N/A";
  const br4 = source["Four-Bedroom"] ?? source.four_bedroom ?? source.rent_4br ?? "N/A";

  const fmt = (v: unknown) => (typeof v === "number" ? `$${v.toLocaleString()}` : String(v));

  return [
    `Fair Market Rents — ${name} (${year})`,
    `  Efficiency: ${fmt(eff)}`,
    `  1-Bedroom:  ${fmt(br1)}`,
    `  2-Bedroom:  ${fmt(br2)}`,
    `  3-Bedroom:  ${fmt(br3)}`,
    `  4-Bedroom:  ${fmt(br4)}`,
  ].join("\n");
}

function formatIncomeLimits(data: Record<string, unknown>): string {
  const name = data.area_name ?? data.county_name ?? data.metro_name ?? "Unknown area";
  const year = data.year ?? "?";
  const median = data.median_income ?? data.median ?? "N/A";
  const fmt = (v: unknown) => (typeof v === "number" ? `$${v.toLocaleString()}` : String(v));

  const lines = [`Income Limits — ${name} (${year})`, `Median Family Income: ${fmt(median)}`];

  const categories = [
    { key: "very_low", label: "Very Low (50%)" },
    { key: "extremely_low", label: "Extremely Low (30%)" },
    { key: "low", label: "Low (80%)" },
  ];

  for (const cat of categories) {
    const vals = data[cat.key] as Record<string, number> | undefined;
    if (vals && typeof vals === "object") {
      const personCounts = Object.entries(vals)
        .map(([k, v]) => `${k}-person: ${fmt(v)}`)
        .join(", ");
      lines.push(`  ${cat.label}: ${personCounts}`);
    }
  }

  return lines.join("\n");
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
        return { content: [{ type: "text" as const, text: "Provide either state or entity_id." }] };
      }

      // Handle state data which may return an array
      if (Array.isArray(data)) {
        const lines = data.slice(0, 20).map((item: any) => formatFmr(item));
        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
      }

      return { content: [{ type: "text" as const, text: formatFmr(data) }] };
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
        return { content: [{ type: "text" as const, text: "Provide either state or entity_id." }] };
      }

      if (Array.isArray(data)) {
        const lines = data.slice(0, 20).map((item: any) => formatIncomeLimits(item));
        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
      }

      return { content: [{ type: "text" as const, text: formatIncomeLimits(data) }] };
    },
  },
  {
    name: "hud_list_states",
    description: "List all U.S. states with their HUD state codes. Use these codes with other HUD tools.",
    annotations: { title: "HUD States", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const states = await listStates();
      if (!states.length) return { content: [{ type: "text" as const, text: "No states returned." }] };
      const lines = states.map((s) => `${s.state_code}: ${s.state_name}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
      if (!counties.length) return { content: [{ type: "text" as const, text: `No counties found for state '${args.state}'.` }] };
      const lines = counties.map((c) => `${c.fips_code}: ${c.county_name}`);
      return {
        content: [{ type: "text" as const, text: `${counties.length} county/area(s) in ${args.state.toUpperCase()}:\n${lines.join("\n")}` }],
      };
    },
  },
  {
    name: "hud_list_metro_areas",
    description: "List metropolitan/CBSA areas. CBSA codes can be used as entity_id in HUD tools.",
    annotations: { title: "HUD Metro Areas", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const areas = await listMetroAreas();
      if (!areas.length) return { content: [{ type: "text" as const, text: "No metro areas returned." }] };
      const preview = areas.slice(0, 50);
      const lines = preview.map((a) => `${a.cbsa_code}: ${a.area_name}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `${areas.length} metro area(s)${areas.length > 50 ? " (showing first 50)" : ""}:\n${lines.join("\n")}`,
          },
        ],
      };
    },
  },
];

export { sdkClearCache as clearCache };

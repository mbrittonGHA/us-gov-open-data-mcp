/**
 * USDA NASS MCP module — agricultural production, crop prices, farm income.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import { queryStats, getCropProduction, getLivestockData, getPriceReceived, getParamValues, getCount } from "../sdk/usda-nass.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "usda-nass";
export const displayName = "USDA NASS QuickStats";
export const description = "Agricultural production, crop prices, farm income, livestock, Census of Agriculture data";
export const auth = { envVar: "USDA_NASS_API_KEY", signup: "https://quickstats.nass.usda.gov/api" };
export const workflow = "usda_crop_data or usda_livestock for specific commodities, usda_prices for price trends, usda_ag_query for custom queries";
export const tips = "Commodities: CORN, SOYBEANS, WHEAT, COTTON, CATTLE, HOGS, MILK. States: IA, IL, TX, CA, NE";

export const reference = {
  topCommodities: {
    CORN: "Corn (grain, silage)", SOYBEANS: "Soybeans", WHEAT: "Wheat (winter, spring, durum)",
    COTTON: "Cotton (upland, pima)", RICE: "Rice", SORGHUM: "Sorghum",
    CATTLE: "Cattle (incl. calves)", HOGS: "Hogs", MILK: "Milk (dairy)",
    CHICKENS: "Chickens (broilers, layers)", EGGS: "Eggs",
  },
  categories: {
    "AREA PLANTED": "Acres planted", "AREA HARVESTED": "Acres harvested",
    PRODUCTION: "Total production (bushels, tons, etc.)", YIELD: "Yield per acre",
    "PRICE RECEIVED": "Price received by farmers ($/unit)", INVENTORY: "Livestock inventory (head)",
    "SALES": "Cash receipts from sales",
  },
  docs: {
    "API Docs": "https://quickstats.nass.usda.gov/api",
    "Get Key": "https://quickstats.nass.usda.gov/api#param_define",
    "QuickStats UI": "https://quickstats.nass.usda.gov/",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "usda_crop_data",
    description: "Get crop production data — area planted, harvested, production, yield.\nCommodities: CORN, SOYBEANS, WHEAT, COTTON, RICE, SORGHUM",
    annotations: { title: "USDA: Crop Data", readOnlyHint: true },
    parameters: z.object({
      commodity: z.string().describe("Crop name: CORN, SOYBEANS, WHEAT, COTTON, RICE"),
      state: z.string().optional().describe("State code: IA, IL, CA, TX. Omit for national"),
      year: z.number().int().optional().describe("Year (omit for all recent years)"),
      category: z.string().optional().describe("PRODUCTION (default), AREA PLANTED, AREA HARVESTED, YIELD"),
    }),
    execute: async ({ commodity, state, year, category }) => {
      const data = await getCropProduction(commodity, { state, year, category });
      if (!data.length) return `No crop data found for ${commodity}${state ? ` in ${state}` : ""}.`;
      const recent = data.slice(0, 50);
      return JSON.stringify({
        summary: `${commodity.toUpperCase()} ${category ?? "PRODUCTION"}: ${recent.length} records${state ? ` for ${state}` : " (national)"}`,
        records: recent.map(r => ({
          year: r.year, state: r.state_alpha, value: r.Value, unit: r.unit_desc,
          description: r.short_desc, period: r.reference_period_desc,
        })),
      });
    },
  },

  {
    name: "usda_livestock",
    description: "Get livestock data — inventory, slaughter, production.\nCommodities: CATTLE, HOGS, CHICKENS, MILK, EGGS",
    annotations: { title: "USDA: Livestock", readOnlyHint: true },
    parameters: z.object({
      commodity: z.string().describe("CATTLE, HOGS, CHICKENS, MILK, EGGS"),
      state: z.string().optional().describe("State code. Omit for national"),
      year: z.number().int().optional().describe("Year"),
      category: z.string().optional().describe("INVENTORY, PRODUCTION, SALES"),
    }),
    execute: async ({ commodity, state, year, category }) => {
      const data = await getLivestockData(commodity, { state, year, category });
      if (!data.length) return `No livestock data for ${commodity}${state ? ` in ${state}` : ""}.`;
      const recent = data.slice(0, 50);
      return JSON.stringify({
        summary: `${commodity.toUpperCase()}: ${recent.length} records${state ? ` for ${state}` : " (national)"}`,
        records: recent.map(r => ({
          year: r.year, state: r.state_alpha, value: r.Value, unit: r.unit_desc,
          description: r.short_desc, period: r.reference_period_desc,
        })),
      });
    },
  },

  {
    name: "usda_prices",
    description: "Get prices received by farmers for agricultural commodities.\nWorks for any commodity: CORN, WHEAT, SOYBEANS, CATTLE, MILK, etc.",
    annotations: { title: "USDA: Prices Received", readOnlyHint: true },
    parameters: z.object({
      commodity: z.string().describe("Any commodity: CORN, WHEAT, SOYBEANS, CATTLE, HOGS, MILK"),
      state: z.string().optional().describe("State code. Omit for national average"),
      year: z.number().int().optional().describe("Year"),
    }),
    execute: async ({ commodity, state, year }) => {
      const data = await getPriceReceived(commodity, { state, year });
      if (!data.length) return `No price data for ${commodity}${state ? ` in ${state}` : ""}.`;
      const recent = data.slice(0, 50);
      return JSON.stringify({
        summary: `${commodity.toUpperCase()} prices: ${recent.length} records${state ? ` for ${state}` : " (national)"}`,
        records: recent.map(r => ({
          year: r.year, state: r.state_alpha, value: r.Value, unit: r.unit_desc,
          description: r.short_desc, period: r.reference_period_desc,
        })),
      });
    },
  },

  {
    name: "usda_ag_query",
    description: "Custom query to USDA NASS QuickStats — any combination of filters.\nMax 50,000 records. Use usda_ag_count first for large queries.",
    annotations: { title: "USDA: Custom Query", readOnlyHint: true },
    parameters: z.object({
      commodity_desc: z.string().optional().describe("Commodity: CORN, WHEAT, CATTLE, etc."),
      source_desc: z.string().optional().describe("SURVEY or CENSUS"),
      sector_desc: z.string().optional().describe("CROPS, ANIMALS & PRODUCTS, ECONOMICS, ENVIRONMENTAL"),
      statisticcat_desc: z.string().optional().describe("AREA PLANTED, PRODUCTION, YIELD, PRICE RECEIVED, INVENTORY"),
      state_alpha: z.string().optional().describe("State code: IA, IL, CA or US for national"),
      year: z.number().int().optional().describe("Year"),
      agg_level_desc: z.string().optional().describe("NATIONAL, STATE, COUNTY"),
      freq_desc: z.string().optional().describe("ANNUAL, MONTHLY, WEEKLY"),
    }),
    execute: async (params) => {
      const data = await queryStats(params);
      if (!data.length) return "No records found for this query.";
      const recent = data.slice(0, 100);
      return JSON.stringify({
        summary: `${data.length} records returned (showing ${recent.length})`,
        totalRecords: data.length,
        records: recent.map(r => ({
          year: r.year, state: r.state_alpha, commodity: r.commodity_desc,
          category: r.statisticcat_desc, value: r.Value, unit: r.unit_desc,
          description: r.short_desc,
        })),
      });
    },
  },
];

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "farm_economy",
    description: "Overview of U.S. agricultural production, prices, and trends.",
    load: async () =>
      "Build a farm economy overview:\n\n" +
      "1. Use usda_crop_data for CORN, SOYBEANS, WHEAT — production for last 3 years (national)\n" +
      "2. Use usda_prices for CORN, SOYBEANS, WHEAT — price trends\n" +
      "3. Use usda_livestock for CATTLE and HOGS — inventory trends\n" +
      "4. Use bls_cpi_breakdown to show food price inflation\n" +
      "5. Use usa_spending_by_agency to show USDA spending\n\n" +
      "Connect the dots: are crop prices rising or falling? How does that correlate with consumer food prices (CPI food component)?",
  },
];

// ─── Re-export cache control ─────────────────────────────────────────

export { clearCache } from "../sdk/usda-nass.js";

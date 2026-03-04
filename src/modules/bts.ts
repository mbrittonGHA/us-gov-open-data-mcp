/**
 * BTS module — Bureau of Transportation Statistics: monthly transport stats, border crossings.
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import { keysEnum, describeEnum } from "../enum-utils.js";
import {
  getTransportStats,
  getBorderCrossings,
  TRANSPORT_FIELDS,
  BORDER_MEASURES,
  DATASETS,
  clearCache as sdkClearCache,
  type TransportStatsRecord,
} from "../sdk/bts.js";
import { tableResponse, emptyResponse } from "../response.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "bts";
export const displayName = "BTS (Bureau of Transportation Statistics)";
export const description =
  "Monthly Transportation Statistics (50+ indicators): airline traffic & on-time %, transit ridership, rail freight, truck tonnage, fuel prices, vehicle sales, safety fatalities, Transportation Services Index, and border crossing data at U.S. ports of entry. No API key required.";
export const workflow =
  "Use bts_transport_stats for national monthly transportation indicators (airlines, transit, rail, fuel, safety) → bts_border_crossings for port-of-entry volumes (trucks, vehicles, pedestrians).";
export const tips =
  "Transport stats are monthly time series — use limit=24 for 2 years of trend data. Border crossing states use full names ('Texas', 'California'). Measures: 'Trucks', 'Personal Vehicles', 'Pedestrians'. Borders: 'US-Mexico Border', 'US-Canada Border'.";

export const reference = {
  transportFields: TRANSPORT_FIELDS,
  borderMeasures: BORDER_MEASURES,
  datasets: DATASETS,
  docs: {
    "BTS Open Data": "https://data.bts.gov/",
    "Monthly Transportation Statistics": "https://data.bts.gov/d/crem-w557",
    "Border Crossing Data": "https://data.bts.gov/d/keg4-3bc2",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "bts_transport_stats",
    description:
      "Get Monthly Transportation Statistics — 50+ national indicators including:\n" +
      "• Airline passenger traffic and on-time performance %\n" +
      "• Transit ridership, highway vehicle miles\n" +
      "• Rail freight, Amtrak ridership and on-time %\n" +
      "• Truck tonnage, fuel prices, vehicle sales\n" +
      "• Transportation Services Index (freight, passenger, combined)\n" +
      "• Border crossing summaries (trucks, persons)\n" +
      "• Safety fatalities (air, rail)\n" +
      "Monthly data going back to 1947 for some series.",
    annotations: { title: "BTS: Transport Statistics", readOnlyHint: true },
    parameters: z.object({
      start_date: z.string().optional().describe("Start date: '2020-01-01'"),
      end_date: z.string().optional().describe("End date: '2024-12-31'"),
      limit: z.number().int().max(120).optional().describe("Months of data (default 24 = 2 years)"),
    }),
    execute: async (args) => {
      const data = await getTransportStats({
        startDate: args.start_date,
        endDate: args.end_date,
        limit: args.limit,
      });
      if (!data.length) return emptyResponse("No transportation statistics found for the given criteria.");
      return tableResponse(`${data.length} month(s) of transportation data`, { rows: data as Record<string, unknown>[], total: data.length });
    },
  },

  {
    name: "bts_border_crossings",
    description:
      "Get border crossing data at U.S. ports of entry: trucks, personal vehicles, pedestrians, train passengers, containers.\n" +
      "Covers U.S.-Mexico and U.S.-Canada borders. Monthly data by port, state, and measure type.",
    annotations: { title: "BTS: Border Crossings", readOnlyHint: true },
    parameters: z.object({
      state: z.string().optional().describe("State full name: 'Texas', 'California', 'New York'"),
      border: z.enum(["US-Mexico Border", "US-Canada Border"]).optional().describe("Border"),
      port_name: z.string().optional().describe("Port of entry name: 'El Paso', 'San Ysidro', 'Detroit'"),
      measure: z.enum(keysEnum(BORDER_MEASURES)).optional().describe(`Measure type: ${describeEnum(BORDER_MEASURES)}`),
      limit: z.number().int().max(100).optional().describe("Max results (default 20)"),
    }),
    execute: async (args) => {
      const data = await getBorderCrossings({
        state: args.state,
        border: args.border,
        portName: args.port_name,
        measure: args.measure,
        limit: args.limit,
      });
      if (!data.length) return emptyResponse("No border crossing data found.");
      return tableResponse(`${data.length} border crossing record(s)`, { rows: data as Record<string, unknown>[], total: data.length });
    },
  },
];

export { sdkClearCache as clearCache };

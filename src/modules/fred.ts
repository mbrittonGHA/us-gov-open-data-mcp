/**
 * FRED MCP module — tools + metadata. Delegates all API calls to sdk/fred.
 *
 * Tools return raw JSON data — no markdown formatting. The client decides how to present it.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import { searchSeries, getSeriesInfo, getObservations, getReleaseData } from "../sdk/fred.js";
import { timeseriesResponse, listResponse, recordResponse, emptyResponse } from "../response.js";

// ─── Metadata (server.ts reads these) ────────────────────────────────

export const name = "fred";
export const displayName = "FRED (Federal Reserve Economic Data)";
export const description = "800K+ economic time series: GDP, CPI, unemployment, interest rates, money supply, housing";
export const auth = { envVar: "FRED_API_KEY", signup: "https://fredaccount.stlouisfed.org/apikeys" };
export const workflow = "fred_search → fred_series_data to get values";
export const tips = "Popular: GDP, UNRATE, CPIAUCSL, FEDFUNDS, DGS10, MORTGAGE30US, M2SL, SP500";

export const reference = {
  popularSeries: {
    GDP: "Gross Domestic Product (quarterly, $B)", UNRATE: "Unemployment Rate (monthly, %)",
    CPIAUCSL: "CPI All Urban Consumers (monthly)", FEDFUNDS: "Fed Funds Rate (monthly, %)",
    DGS10: "10-Year Treasury (daily, %)", MORTGAGE30US: "30-Year Mortgage (weekly, %)",
    M2SL: "M2 Money Stock (monthly, $B)", SP500: "S&P 500 (daily)",
    PAYEMS: "Nonfarm Payrolls (monthly, K)", CIVPART: "Labor Participation (monthly, %)",
    MSPUS: "Median Home Price (quarterly, $)", MEHOINUSA672N: "Median Household Income (annual)",
  },
  docs: {
    "v1 API": "https://fred.stlouisfed.org/docs/api/fred/",
    "v2 API": "https://research.stlouisfed.org/docs/api/fred/v2/",
    "Get Key": "https://fredaccount.stlouisfed.org/apikeys",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "fred_search",
    description: "Search FRED series by keyword.\nExamples: 'GDP', 'unemployment', 'CPI', 'mortgage rate'",
    annotations: { title: "FRED: Search", readOnlyHint: true },
    parameters: z.object({
      query: z.string().describe("Keywords"),
      limit: z.number().int().max(100).optional().describe("Max results (default 20)"),
    }),
    execute: async ({ query, limit }) => {
      const data = await searchSeries(query, limit ?? 20);
      if (!data.seriess?.length) return emptyResponse(`No series found for "${query}".`);
      return listResponse(
        `FRED search "${query}": ${data.count} total, showing ${data.seriess.length}`,
        { items: data.seriess, total: data.count },
      );
    },
  },

  {
    name: "fred_series_info",
    description: "Get metadata for a FRED series — title, units, frequency, range, notes.",
    annotations: { title: "FRED: Series Info", readOnlyHint: true },
    parameters: z.object({
      series_id: z.string().describe("e.g. 'GDP', 'UNRATE', 'CPIAUCSL'"),
    }),
    execute: async ({ series_id }) => {
      const s = await getSeriesInfo(series_id);
      if (!s) return emptyResponse(`"${series_id}" not found.`);
      return recordResponse(
        `${s.id}: ${s.title} (${s.frequency}, ${s.units}, ${s.observation_start}–${s.observation_end})`,
        s,
      );
    },
  },

  {
    name: "fred_series_data",
    description: "Get observations for a FRED series.\nPopular: GDP, UNRATE, CPIAUCSL, FEDFUNDS, DGS10, MORTGAGE30US",
    annotations: { title: "FRED: Series Data", readOnlyHint: true },
    parameters: z.object({
      series_id: z.string().describe("Series ID"),
      limit: z.number().int().max(100000).optional().describe("Max obs (default 1000)"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("default: desc"),
      frequency: z.string().optional().describe("d, w, bw, m, q, sa, a"),
      start_date: z.string().optional().describe("YYYY-MM-DD"),
      end_date: z.string().optional().describe("YYYY-MM-DD"),
    }),
    execute: async ({ series_id, limit, sort_order, frequency, start_date, end_date }) => {
      const data = await getObservations(series_id, {
        start: start_date, end: end_date, limit, sort: sort_order, frequency,
      });
      if (!data.observations?.length) return emptyResponse(`No observations for "${series_id}".`);
      return timeseriesResponse(
        `${series_id.toUpperCase()}: ${data.count} observations, ${data.observation_start} to ${data.observation_end}`,
        {
          rows: data.observations,
          dateKey: "date",
          valueKey: "value",
          total: data.count,
          meta: { seriesId: series_id.toUpperCase(), start: data.observation_start, end: data.observation_end },
        },
      );
    },
  },

  {
    name: "fred_release_data",
    description: "Bulk fetch a FRED release.\nCommon: 53 (GDP), 50 (Employment), 10 (CPI), 18 (Rates)",
    annotations: { title: "FRED: Release Data", readOnlyHint: true },
    parameters: z.object({
      release_id: z.number().int().positive().describe("e.g. 53 (GDP)"),
      limit: z.number().int().max(500000).optional().describe("Max obs"),
    }),
    execute: async ({ release_id, limit }) => {
      const data = await getReleaseData(release_id, limit);
      const series = data.series ?? [];
      if (!series.length) return emptyResponse(`No series found for release ${release_id}.`);
      return listResponse(
        `${data.release?.name ?? `Release ${release_id}`}: ${series.length} series, has_more: ${data.has_more}`,
        {
          items: series,
          meta: { release: data.release, hasMore: data.has_more, nextCursor: data.next_cursor ?? null },
        },
      );
    },
  },
];

// ─── Re-export cache control from SDK ────────────────────────────────

export { clearCache } from "../sdk/fred.js";

// ─── Prompts (FastMCP InputPrompt type) ──────────────────────────────

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "recession_check",
    description: "Analyze whether the U.S. is in or approaching a recession using key economic indicators with legislative context.",
    load: async () =>
      "Use fred_series_data to fetch the following for the last 2 years (sort: desc, frequency: m or q as appropriate):\n\n" +
      "== ECONOMIC INDICATORS ==\n" +
      "1. GDP — quarterly growth (negative 2 consecutive quarters = technical recession)\n" +
      "2. UNRATE — unemployment trend (rising = weakening labor market)\n" +
      "3. PAYEMS — nonfarm payrolls (declining = job losses)\n" +
      "4. CPIAUCSL — inflation trend (context for Fed policy)\n" +
      "5. FEDFUNDS — Fed rate (tightening vs easing cycle)\n" +
      "6. UMCSENT — consumer sentiment (leading indicator)\n\n" +
      "== LEGISLATIVE/FISCAL CONTEXT ==\n" +
      "7. Use congress_recent_laws to find any stimulus, relief, or economic bills passed recently\n" +
      "8. Use congress_house_votes and congress_senate_votes for party-line breakdown on key economic legislation\n" +
      "9. Use Treasury fiscal_snapshot data (debt, revenue, outlays) for fiscal backdrop\n" +
      "10. Use dol_ui_claims_national for the latest weekly unemployment insurance claims (leading indicator)\n\n" +
      "Analyze the trends together. A recession typically shows: declining GDP, rising unemployment, " +
      "falling payrolls, and deteriorating consumer sentiment. Present the data and your assessment " +
      "with appropriate caveats about confounding factors.",
  },
];

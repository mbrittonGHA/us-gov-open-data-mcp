/**
 * World Bank MCP module — international economic comparisons.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import { getIndicator, compareCountries, searchIndicators, listCountries, POPULAR_INDICATORS } from "../sdk/world-bank.js";
import { timeseriesResponse, tableResponse, listResponse, recordResponse, emptyResponse } from "../response.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "world-bank";
export const displayName = "World Bank";
export const description = "International economic indicators for 200+ countries: GDP, population, health spending, life expectancy, trade, inequality";
export const workflow = "wb_indicator for a single country, wb_compare to compare countries, wb_search to find indicator IDs";
export const tips = "Countries: US, GB, DE, JP, CN, IN, BR. Indicators: NY.GDP.MKTP.CD (GDP), SP.POP.TOTL (population), SP.DYN.LE00.IN (life expectancy)";

export const reference = {
  popularIndicators: POPULAR_INDICATORS,
  docs: {
    "API Docs": "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392",
    "Indicator List": "https://data.worldbank.org/indicator",
    "Country Codes": "https://datahelpdesk.worldbank.org/knowledgebase/articles/898590",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "wb_indicator",
    description: "Get a World Bank indicator for a country.\nPopular: NY.GDP.MKTP.CD (GDP), SP.DYN.LE00.IN (life expectancy), SH.XPD.CHEX.PC.CD (health spend/capita), SL.UEM.TOTL.ZS (unemployment)",
    annotations: { title: "World Bank: Get Indicator", readOnlyHint: true },
    parameters: z.object({
      indicator: z.string().describe("Indicator code, e.g. 'NY.GDP.MKTP.CD'"),
      country: z.string().optional().describe("ISO2 code: US, GB, DE, JP, CN. Default: US"),
      date_range: z.string().optional().describe("Year range: '2015:2024' or single year '2024'. Default: last 10 years"),
    }),
    execute: async ({ indicator, country, date_range }) => {
      const now = new Date().getFullYear();
      const result = await getIndicator(indicator, {
        country: country ?? "US",
        dateRange: date_range ?? `${now - 10}:${now}`,
      });
      if (!result.data.length) return emptyResponse(`No data for indicator ${indicator} in ${country ?? "US"}.`);
      const valid = result.data.filter(d => d.value !== null);
      return timeseriesResponse(
        `${result.data[0]?.indicator?.value ?? indicator}: ${valid.length} data points for ${result.data[0]?.country?.value ?? country}`,
        {
          rows: valid.map(d => ({ year: d.date, value: d.value })),
          dateKey: "year",
          valueKey: "value",
          total: result.total,
          meta: { indicator: result.data[0]?.indicator, country: result.data[0]?.country },
        },
      );
    },
  },

  {
    name: "wb_compare",
    description: "Compare a World Bank indicator across multiple countries.\nGreat for 'How does US compare to...' questions.",
    annotations: { title: "World Bank: Compare Countries", readOnlyHint: true },
    parameters: z.object({
      indicator: z.string().describe("Indicator code"),
      countries: z.string().describe("Semicolon-separated ISO2 codes: 'US;GB;DE;JP;CN'"),
      date_range: z.string().optional().describe("Year range: '2015:2024'. Default: last 5 years"),
    }),
    execute: async ({ indicator, countries, date_range }) => {
      const now = new Date().getFullYear();
      const countryList = countries.split(/[;,]/).map((c: string) => c.trim()).filter(Boolean);
      const result = await compareCountries(indicator, countryList, {
        dateRange: date_range ?? `${now - 5}:${now}`,
      });
      if (!result.data.length) return emptyResponse(`No data for ${indicator} across ${countries}.`);

      // Group by country
      const byCountry: Record<string, { year: string; value: number | null }[]> = {};
      for (const d of result.data) {
        const key = d.countryiso3code || d.country?.value || "?";
        if (!byCountry[key]) byCountry[key] = [];
        byCountry[key].push({ year: d.date, value: d.value });
      }

      return recordResponse(
        `${result.data[0]?.indicator?.value ?? indicator} comparison across ${Object.keys(byCountry).length} countries`,
        { indicator: result.data[0]?.indicator, countries: byCountry },
      );
    },
  },

  {
    name: "wb_search",
    description: "Search World Bank indicators by keyword.\nExamples: 'GDP', 'health expenditure', 'life expectancy', 'CO2 emissions'",
    annotations: { title: "World Bank: Search Indicators", readOnlyHint: true },
    parameters: z.object({
      query: z.string().describe("Keywords to search for"),
    }),
    execute: async ({ query }) => {
      const results = await searchIndicators(query, 30);
      if (!results.length) return emptyResponse(`No indicators found for "${query}".`);
      return listResponse(
        `${results.length} indicators matching "${query}"`,
        { items: results.map(i => ({ id: i.id, name: i.name, source: i.source?.value })) },
      );
    },
  },

  {
    name: "wb_countries",
    description: "List World Bank countries with region, income level, and capital city.",
    annotations: { title: "World Bank: List Countries", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const countries = await listCountries();
      return tableResponse(
        `${countries.length} countries`,
        {
          rows: countries.map(c => ({
            code: c.iso2Code, name: c.name, region: c.region?.value,
            income: c.incomeLevel?.value, capital: c.capitalCity,
          })),
        },
      );
    },
  },
];

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "international_comparison",
    description: "Compare the U.S. to peer nations on key economic and social indicators.",
    load: async () =>
      "Use wb_compare to compare the U.S. (US) with major economies (GB, DE, JP, CN, CA, FR) on these indicators:\n\n" +
      "1. NY.GDP.PCAP.CD — GDP per capita\n" +
      "2. SH.XPD.CHEX.PC.CD — Health expenditure per capita\n" +
      "3. SP.DYN.LE00.IN — Life expectancy at birth\n" +
      "4. SL.UEM.TOTL.ZS — Unemployment rate\n" +
      "5. GC.DOD.TOTL.GD.ZS — Government debt as % of GDP\n" +
      "6. FP.CPI.TOTL.ZG — Inflation rate\n\n" +
      "Use date range last 5 years. Present as a comparison table. Note where the U.S. ranks among peers and highlight any outliers.",
  },
];

export { clearCache } from "../sdk/world-bank.js";

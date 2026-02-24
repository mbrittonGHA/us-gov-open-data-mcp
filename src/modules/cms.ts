/**
 * CMS module — hospital compare, nursing home ratings, Medicare spending, provider data
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import {
  searchDatasets,
  queryDataset,
  queryByKey,
  clearCache as sdkClearCache,
  DATASETS,
} from "../sdk/cms.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "cms";
export const displayName = "CMS";
export const description =
  "Centers for Medicare & Medicaid Services — hospital compare, nursing home ratings, home health agencies, hospice, dialysis, Medicare spending, HCAHPS patient surveys, quality measures. No API key required.";
export const workflow =
  "Use cms_search to find datasets by keyword → cms_hospitals for hospital quality data → cms_nursing_homes for nursing home ratings → cms_query for any CMS provider dataset.";
export const tips =
  "CMS has 100+ provider datasets. Use cms_search to discover them. Common dataset keys: hospital_info, nursing_home_info, hospital_mortality, hospital_readmissions, hospital_infections, hospital_timely_care, hospital_spending, hospital_patient_survey, nursing_home_health_citations. Filter by state using conditions like property='state' value='CA'.";
export const reference = { datasets: DATASETS };

// ─── Helpers ─────────────────────────────────────────────────────────

function summarizeResults(data: Record<string, unknown>[], count?: number): string {
  if (!data.length) return "No records found.";

  const preview = data.slice(0, 10);
  const lines = preview.map((r, i) => {
    // Try to extract key fields for readability
    const name =
      r.facility_name ?? r.provider_name ?? r.hospital_name ?? r["Facility Name"] ?? r["Provider Name"] ?? "";
    const state = r.state ?? r.provider_state ?? r["State"] ?? "";
    const city = r.city ?? r.provider_city ?? r["City"] ?? "";
    const rating = r.overall_rating ?? r.hospital_overall_rating ?? r["Overall Rating"] ?? "";

    const location = [city, state].filter(Boolean).join(", ");
    const header = name ? `${name}${location ? ` (${location})` : ""}` : `Record ${i + 1}`;
    const ratingStr = rating ? ` — Rating: ${rating}` : "";

    return `[${i + 1}] ${header}${ratingStr}\n     ${JSON.stringify(r)}`;
  });

  const total = count ?? data.length;
  const header = `${total} record(s)${total > 10 ? " (showing first 10)" : ""}:`;
  return `${header}\n\n${lines.join("\n\n")}`;
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "cms_search",
    description:
      "Search for CMS provider data datasets by keyword. Returns dataset IDs, titles, and descriptions. Use the ID with cms_query to fetch data.",
    annotations: { title: "CMS Dataset Search", readOnlyHint: true },
    parameters: z.object({
      keyword: z.string().describe("Search keyword (e.g. 'hospital', 'nursing home', 'dialysis', 'hospice', 'readmission', 'infection')"),
    }),
    execute: async (args) => {
      const results = await searchDatasets(args.keyword);
      if (!results.length) return { content: [{ type: "text" as const, text: "No datasets found." }] };

      const lines = results.map(
        (d) => `[${d.identifier}] ${d.title}\n  ${d.description?.slice(0, 200) ?? ""}${d.theme ? `\n  Theme: ${d.theme.join(", ")}` : ""}`
      );
      return {
        content: [{ type: "text" as const, text: `${results.length} dataset(s) found:\n\n${lines.join("\n\n")}` }],
      };
    },
  },
  {
    name: "cms_hospitals",
    description:
      "Query CMS hospital data: general info, quality ratings, mortality, readmissions, infections, patient surveys, Medicare spending. Filter by state or city.",
    annotations: { title: "CMS Hospital Data", readOnlyHint: true },
    parameters: z.object({
      dataset: z
        .enum([
          "hospital_info",
          "hospital_mortality",
          "hospital_readmissions",
          "hospital_infections",
          "hospital_timely_care",
          "hospital_spending",
          "hospital_patient_survey",
        ])
        .default("hospital_info")
        .describe("Hospital dataset to query"),
      state: z.string().max(2).optional().describe("Two-letter state code (e.g. CA, TX, NY)"),
      city: z.string().optional().describe("City name"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    execute: async (args) => {
      const conditions: Array<{ property: string; value: string }> = [];
      if (args.state) conditions.push({ property: "state", value: args.state.toUpperCase() });
      if (args.city) conditions.push({ property: "city", value: args.city.toUpperCase() });

      const result = await queryByKey(args.dataset, conditions, args.limit);
      return { content: [{ type: "text" as const, text: summarizeResults(result.results, result.count) }] };
    },
  },
  {
    name: "cms_nursing_homes",
    description:
      "Query CMS nursing home data: provider info with five-star ratings, quality measures, health deficiencies/citations. Filter by state.",
    annotations: { title: "CMS Nursing Home Data", readOnlyHint: true },
    parameters: z.object({
      dataset: z
        .enum(["nursing_home_info", "nursing_home_health_citations", "nursing_home_quality"])
        .default("nursing_home_info")
        .describe("Nursing home dataset to query"),
      state: z.string().max(2).optional().describe("Two-letter state code"),
      limit: z.number().optional().describe("Max results (default 50)"),
    }),
    execute: async (args) => {
      const conditions: Array<{ property: string; value: string }> = [];
      if (args.state) conditions.push({ property: "state", value: args.state.toUpperCase() });

      const result = await queryByKey(args.dataset, conditions, args.limit);
      return { content: [{ type: "text" as const, text: summarizeResults(result.results, result.count) }] };
    },
  },
  {
    name: "cms_query",
    description:
      "General-purpose query against any CMS provider dataset by dataset identifier. Use cms_search to find available datasets and their IDs. Supports filtering by any field.",
    annotations: { title: "CMS Query", readOnlyHint: true },
    parameters: z.object({
      dataset_id: z
        .string()
        .describe("CMS dataset identifier (e.g. 'xubh-q36u' for hospitals, '4pq5-n9py' for nursing homes) or catalog key"),
      filter_field: z.string().optional().describe("Field name to filter on (e.g. 'state', 'city', 'provider_name')"),
      filter_value: z.string().optional().describe("Value to filter for"),
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Offset for pagination"),
    }),
    execute: async (args) => {
      // Check if dataset_id is a catalog key
      const catalogEntry = DATASETS[args.dataset_id];
      const datasetId = catalogEntry?.id ?? args.dataset_id;

      const conditions: Array<{ property: string; value: string }> = [];
      if (args.filter_field && args.filter_value) {
        conditions.push({ property: args.filter_field, value: args.filter_value });
      }

      const result = await queryDataset({
        datasetId,
        conditions: conditions.length ? conditions : undefined,
        limit: args.limit,
        offset: args.offset,
      });
      return { content: [{ type: "text" as const, text: summarizeResults(result.results, result.count) }] };
    },
  },
];

export { sdkClearCache as clearCache };

/**
 * USPTO module — Patent search, inventor lookup, assignee analysis via PatentsView API
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import {
  searchPatents,
  getPatent,
  searchInventors,
  searchAssignees,
  clearCache as sdkClearCache,
} from "../sdk/uspto.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "uspto";
export const displayName = "USPTO PatentsView";
export const description =
  "U.S. Patent & Trademark Office patent data via PatentsView — search patents by keyword, assignee, inventor, date, or CPC class. Look up inventors and patent-holding organizations. Covers all U.S. utility, design, plant, and reissue patents.";
export const workflow =
  "Use uspto_search_patents to find patents by keyword, company, or inventor → uspto_patent_details for full details on a specific patent → uspto_search_assignees to find companies with the most patents in an area.";
export const tips =
  "Patent types: 'utility' (most common), 'design', 'plant', 'reissue'. CPC sections: A (Human Necessities), B (Operations/Transport), C (Chemistry), D (Textiles), E (Construction), F (Mechanical Engineering), G (Physics), H (Electricity). Use yearFrom/yearTo to filter by grant date. Patent numbers don't have commas (e.g. '11234567' not '11,234,567').";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatPatent(p: {
  patentNumber: string;
  patentTitle: string;
  patentDate: string;
  patentAbstract: string | null;
  patentType: string | null;
  numClaims: number | null;
  assigneeOrganization: string | null;
  inventorNames: string[];
  cpcGroup: string | null;
}): string {
  const lines: string[] = [
    `Patent ${p.patentNumber}: ${p.patentTitle}`,
    `  Date: ${p.patentDate}  Type: ${p.patentType ?? "N/A"}  Claims: ${p.numClaims ?? "N/A"}`,
  ];
  if (p.assigneeOrganization) lines.push(`  Assignee: ${p.assigneeOrganization}`);
  if (p.inventorNames.length) lines.push(`  Inventors: ${p.inventorNames.join(", ")}`);
  if (p.cpcGroup) lines.push(`  CPC: ${p.cpcGroup}`);
  if (p.patentAbstract) lines.push(`  Abstract: ${p.patentAbstract}`);
  return lines.join("\n");
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "uspto_search_patents",
    description:
      "Search U.S. patents by keyword, assignee (company), inventor name, date range, patent type, or CPC technology class. Returns patent number, title, date, assignee, inventors, and abstract.",
    annotations: { title: "Search Patents", readOnlyHint: true },
    parameters: z.object({
      query: z.string().optional().describe("Search text — matches against title and abstract"),
      assignee: z.string().optional().describe("Assignee organization name (e.g. 'Google', 'IBM', 'MIT')"),
      inventor: z.string().optional().describe("Inventor name to search"),
      year_from: z.number().optional().describe("Start year for patent grant date (e.g. 2020)"),
      year_to: z.number().optional().describe("End year for patent grant date (e.g. 2024)"),
      patent_type: z.enum(["utility", "design", "plant", "reissue"]).optional().describe("Patent type filter"),
      cpc_section: z.string().optional().describe("CPC section letter: A-H (e.g. 'G' for Physics, 'H' for Electricity)"),
      page: z.number().optional().describe("Page number (default 1)"),
      per_page: z.number().max(50).optional().describe("Results per page (max 50, default 25)"),
    }),
    execute: async (args) => {
      const result = await searchPatents({
        query: args.query,
        assignee: args.assignee,
        inventor: args.inventor,
        yearFrom: args.year_from,
        yearTo: args.year_to,
        patentType: args.patent_type,
        cpcSection: args.cpc_section,
        page: args.page,
        perPage: args.per_page,
      });

      if (!result.patents.length) {
        return { content: [{ type: "text" as const, text: "No patents found matching the criteria." }] };
      }

      const header = `Found ${result.total.toLocaleString()} patent(s). Showing ${result.patents.length}:\n`;
      const body = result.patents.map(formatPatent).join("\n\n");
      return { content: [{ type: "text" as const, text: header + body }] };
    },
  },
  {
    name: "uspto_patent_details",
    description:
      "Get details for a specific U.S. patent by patent number. Returns title, date, abstract, assignee, inventors, claims count, and CPC classification.",
    annotations: { title: "Patent Details", readOnlyHint: true },
    parameters: z.object({
      patent_number: z.string().describe("Patent number (e.g. '11234567' — no commas)"),
    }),
    execute: async (args) => {
      const patent = await getPatent(args.patent_number);
      if (!patent) {
        return { content: [{ type: "text" as const, text: `Patent ${args.patent_number} not found.` }] };
      }
      return { content: [{ type: "text" as const, text: formatPatent(patent) }] };
    },
  },
  {
    name: "uspto_search_inventors",
    description:
      "Search for patent inventors by name, state, or country. Shows inventor details and patent counts.",
    annotations: { title: "Search Inventors", readOnlyHint: true },
    parameters: z.object({
      name: z.string().optional().describe("Inventor name to search (first or last)"),
      first_name: z.string().optional().describe("Inventor first name"),
      last_name: z.string().optional().describe("Inventor last name"),
      state: z.string().optional().describe("U.S. state abbreviation (e.g. CA, TX)"),
      country: z.string().optional().describe("Country code (e.g. US, CN, JP, DE)"),
      page: z.number().optional().describe("Page number (default 1)"),
    }),
    execute: async (args) => {
      const result = await searchInventors({
        name: args.name,
        firstName: args.first_name,
        lastName: args.last_name,
        state: args.state,
        country: args.country,
        page: args.page,
      });

      if (!result.inventors.length) {
        return { content: [{ type: "text" as const, text: "No inventors found matching the criteria." }] };
      }

      const lines = result.inventors.map((inv) => {
        const loc = [inv.inventorCity, inv.inventorState, inv.inventorCountry].filter(Boolean).join(", ");
        return `${inv.inventorFirstName} ${inv.inventorLastName} — ${loc || "Location unknown"} (${inv.patentCount} patent(s))`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${result.total.toLocaleString()} inventor(s). Showing ${result.inventors.length}:\n${lines.join("\n")}`,
          },
        ],
      };
    },
  },
  {
    name: "uspto_search_assignees",
    description:
      "Search for patent assignees (companies, universities, government agencies) by name, state, or country. Shows organization details and patent counts.",
    annotations: { title: "Search Assignees", readOnlyHint: true },
    parameters: z.object({
      organization: z.string().optional().describe("Organization name (e.g. 'Apple', 'Stanford University')"),
      state: z.string().optional().describe("U.S. state abbreviation (e.g. CA, TX)"),
      country: z.string().optional().describe("Country code (e.g. US, CN, JP, DE)"),
      type: z.string().optional().describe("Assignee type: 2=US company, 3=foreign company, 4=US individual, 5=foreign individual, 6=US government, 7=foreign government, 8=country govt, 9=state govt"),
      page: z.number().optional().describe("Page number (default 1)"),
    }),
    execute: async (args) => {
      const result = await searchAssignees({
        organization: args.organization,
        state: args.state,
        country: args.country,
        type: args.type,
        page: args.page,
      });

      if (!result.assignees.length) {
        return { content: [{ type: "text" as const, text: "No assignees found matching the criteria." }] };
      }

      const lines = result.assignees.map((a) => {
        const loc = [a.assigneeCity, a.assigneeState, a.assigneeCountry].filter(Boolean).join(", ");
        const name = a.assigneeOrganization || "(Individual)";
        return `${name} — ${loc || "Location unknown"} (${a.patentCount} patent(s))`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${result.total.toLocaleString()} assignee(s). Showing ${result.assignees.length}:\n${lines.join("\n")}`,
          },
        ],
      };
    },
  },
];

export { sdkClearCache as clearCache };

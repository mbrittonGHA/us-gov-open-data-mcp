/**
 * FEMA module — OpenFEMA disaster declarations, housing assistance, NFIP claims, public assistance
 */

import { z } from "zod";
import type { Tool } from "fastmcp";
import {
  getDisasterDeclarations,
  getHousingAssistance,
  getPublicAssistance,
  getFemaRegions,
  queryDataset,
  clearCache as sdkClearCache,
  DATASETS,
  type DisasterDeclaration,
  type HousingAssistanceRecord,
  type PublicAssistanceRecord,
} from "../sdk/fema.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "fema";
export const displayName = "FEMA";
export const description =
  "Federal Emergency Management Agency — disaster declarations, emergency/major disaster assistance, NFIP flood insurance claims, housing assistance, public assistance grants. Data since 1953.";
export const workflow =
  "Use fema_disaster_declarations to find disasters by state/year/type → fema_housing_assistance for individual assistance details → fema_public_assistance for PA grants → fema_query for NFIP claims or any other dataset.";
export const tips =
  "State codes are two-letter uppercase (TX, FL, CA). Incident types include Hurricane, Flood, Fire, Severe Storm(s), Tornado, Earthquake, Snow, Biological. Declaration types: DR (Major Disaster), EM (Emergency), FM (Fire Management). Use fema_query with dataset 'nfip_claims' to analyze flood insurance data.";
export const reference = { datasets: DATASETS };

// ─── Helpers ─────────────────────────────────────────────────────────

function summarizeDisasters(data: DisasterDeclaration[]): string {
  if (!data.length) return "No disaster declarations found.";
  const lines = data.map((d) => {
    const date = d.declarationDate ? d.declarationDate.slice(0, 10) : "unknown date";
    return `[${d.disasterNumber ?? "?"}] ${date} — ${d.disasterName ?? "Unnamed"} (${d.incidentType ?? "?"}) — ${d.state ?? "?"}, ${d.designatedArea ?? ""} [${d.declarationType ?? "?"}]`;
  });
  return `${data.length} disaster declaration(s):\n${lines.join("\n")}`;
}

function summarizeHousing(data: HousingAssistanceRecord[]): string {
  if (!data.length) return "No housing assistance records found.";
  const lines = data.map((d) => {
    const loc = [d.county, d.state, d.zipCode].filter(Boolean).join(", ");
    const amt = d.totalApprovedIhpAmount != null ? `$${d.totalApprovedIhpAmount.toLocaleString()}` : "N/A";
    return `Disaster ${d.disasterNumber ?? "?"} — ${loc} — Total IHP: ${amt}, Registrations: ${d.validRegistrations ?? "?"}, Inspected: ${d.totalInspected ?? "?"}`;
  });
  return `${data.length} housing assistance record(s):\n${lines.join("\n")}`;
}

function summarizePA(data: PublicAssistanceRecord[]): string {
  if (!data.length) return "No public assistance records found.";
  const lines = data.map((d) => {
    const amt = d.federalShareObligated != null ? `$${d.federalShareObligated.toLocaleString()}` : "N/A";
    return `Disaster ${d.disasterNumber ?? "?"} — ${d.applicantName ?? "?"} (${d.state ?? "?"}) — ${d.damageCategory ?? "?"}: Federal Share ${amt}`;
  });
  return `${data.length} public assistance record(s):\n${lines.join("\n")}`;
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "fema_disaster_declarations",
    description:
      "Search FEMA disaster declarations (since 1953). Filter by state, year, incident type, or declaration type. Returns disaster name, type, affected area, programs declared.",
    annotations: { title: "FEMA Disaster Declarations", readOnlyHint: true },
    parameters: z.object({
      state: z.string().max(2).optional().describe("Two-letter state code (e.g. TX, FL, CA)"),
      year: z.number().optional().describe("Filter by year of declaration"),
      incident_type: z.string().optional().describe("Incident type: Hurricane, Flood, Fire, Severe Storm(s), Tornado, Earthquake, Snow, Biological"),
      declaration_type: z.string().optional().describe("DR=Major Disaster, EM=Emergency, FM=Fire Management"),
      top: z.number().optional().describe("Max results (default 50)"),
      skip: z.number().optional().describe("Number of records to skip for pagination"),
    }),
    execute: async (args) => {
      const data = await getDisasterDeclarations({
        state: args.state,
        year: args.year,
        incidentType: args.incident_type,
        declarationType: args.declaration_type,
        top: args.top,
        skip: args.skip,
      });
      return { content: [{ type: "text" as const, text: summarizeDisasters(data) }] };
    },
  },
  {
    name: "fema_housing_assistance",
    description:
      "Get FEMA Individual Housing Program (IHP) assistance data for homeowners. Shows approved assistance amounts, inspections, and damage by county/zip for a disaster.",
    annotations: { title: "FEMA Housing Assistance", readOnlyHint: true },
    parameters: z.object({
      disaster_number: z.number().optional().describe("FEMA disaster number (from disaster declarations)"),
      state: z.string().max(2).optional().describe("Two-letter state code"),
      county: z.string().optional().describe("County name"),
      top: z.number().optional().describe("Max results (default 50)"),
      skip: z.number().optional().describe("Number of records to skip"),
    }),
    execute: async (args) => {
      const data = await getHousingAssistance({
        disasterNumber: args.disaster_number,
        state: args.state,
        county: args.county,
        top: args.top,
        skip: args.skip,
      });
      return { content: [{ type: "text" as const, text: summarizeHousing(data) }] };
    },
  },
  {
    name: "fema_public_assistance",
    description:
      "Get FEMA Public Assistance (PA) grant awards. Shows project-level grants to state/local/tribal governments and nonprofits for debris removal, emergency work, and permanent repair.",
    annotations: { title: "FEMA Public Assistance", readOnlyHint: true },
    parameters: z.object({
      disaster_number: z.number().optional().describe("FEMA disaster number"),
      state: z.string().max(2).optional().describe("Two-letter state code"),
      top: z.number().optional().describe("Max results (default 50)"),
      skip: z.number().optional().describe("Number of records to skip"),
    }),
    execute: async (args) => {
      const data = await getPublicAssistance({
        disasterNumber: args.disaster_number,
        state: args.state,
        top: args.top,
        skip: args.skip,
      });
      return { content: [{ type: "text" as const, text: summarizePA(data) }] };
    },
  },
  {
    name: "fema_regions",
    description: "Get FEMA region boundaries and associated states. 10 FEMA regions cover all U.S. states and territories.",
    annotations: { title: "FEMA Regions", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const data = await getFemaRegions();
      if (!data.length) return { content: [{ type: "text" as const, text: "No FEMA region data found." }] };
      const lines = data.map((r) => `Region ${r.regionNumber}: ${r.regionName ?? ""} — ${r.states ?? ""}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  },
  {
    name: "fema_query",
    description:
      "General-purpose query against any OpenFEMA v2 dataset. Use this for NFIP flood insurance claims/policies, hazard mitigation grants, mission assignments, IHP registrations, etc. Supports OData $filter syntax.",
    annotations: { title: "FEMA Query", readOnlyHint: true },
    parameters: z.object({
      dataset: z
        .string()
        .describe(
          "Dataset key (disaster_declarations, housing_owners, housing_renters, public_assistance, nfip_claims, nfip_policies, hazard_mitigation, mission_assignments, fema_regions, registrations) or raw endpoint name"
        ),
      filter: z.string().optional().describe("OData $filter expression (e.g. \"state eq 'TX' and yearOfLoss eq '2017'\")"),
      select: z.string().optional().describe("Comma-separated fields to return (OData $select)"),
      order_by: z.string().optional().describe("OData $orderby expression (e.g. 'dateOfLoss desc')"),
      top: z.number().optional().describe("Max results (default 50)"),
      skip: z.number().optional().describe("Offset for pagination"),
    }),
    execute: async (args) => {
      const data = await queryDataset({
        dataset: args.dataset,
        filter: args.filter,
        select: args.select,
        orderBy: args.order_by,
        top: args.top,
        skip: args.skip,
      });
      if (!data.length) return { content: [{ type: "text" as const, text: "No records found for the given query." }] };
      const preview = data.slice(0, 10);
      const text =
        `${data.length} record(s) returned${data.length > 10 ? " (showing first 10)" : ""}:\n` +
        preview.map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`).join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  },
];

export { sdkClearCache as clearCache };

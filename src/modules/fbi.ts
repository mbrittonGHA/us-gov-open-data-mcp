/**
 * FBI Crime Data Explorer MCP module — tools + metadata.
 * Delegates all API calls to sdk/fbi.
 *
 * Tools return raw JSON data — no markdown formatting. The client decides how to present it.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import {
  getCrimeByState,
  getNationalCrime,
  getArrestData,
  type CrimeEstimate,
  type ArrestRecord,
} from "../sdk/fbi.js";

// ─── Metadata (server.ts reads these) ────────────────────────────────

export const name = "fbi";
export const displayName = "FBI Crime Data Explorer";
export const description = "National/state crime estimates, arrests, offense demographics";
export const auth = { envVar: "DATA_GOV_API_KEY", signup: "https://api.data.gov/signup/" };
export const workflow = "fbi_crime_national or fbi_crime_by_state → fbi_arrest_data for detail";
export const tips = "State codes: two-letter abbreviations (CA, TX, NY). Data typically available up to 1-2 years ago.";

export const reference = {
  offenseTypes: {
    "aggravated-assault": "Aggravated Assault",
    "burglary": "Burglary",
    "larceny": "Larceny/Theft",
    "motor-vehicle-theft": "Motor Vehicle Theft",
    "homicide": "Murder and Nonnegligent Manslaughter",
    "rape": "Rape",
    "robbery": "Robbery",
    "arson": "Arson",
    "violent-crime": "Violent Crime (total)",
    "property-crime": "Property Crime (total)",
    "drug-abuse": "Drug Abuse Violations",
  } as Record<string, string>,
  docs: {
    "API Docs": "https://crime-data-explorer.fr.cloud.gov/pages/docApi",
    "Explorer": "https://crime-data-explorer.fr.cloud.gov/",
    "Get Key": "https://api.data.gov/signup/",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────

function summarizeCrime(d: CrimeEstimate) {
  return {
    year: d.year ?? d.data_year ?? null,
    population: d.population ?? null,
    violentCrime: d.violent_crime ?? null,
    propertyCrime: d.property_crime ?? null,
    homicide: d.homicide ?? null,
    robbery: d.robbery ?? null,
    aggravatedAssault: d.aggravated_assault ?? null,
    burglary: d.burglary ?? null,
    larceny: d.larceny ?? null,
    motorVehicleTheft: d.motor_vehicle_theft ?? null,
    rape: d.rape ?? null,
    arson: d.arson ?? null,
  };
}

function summarizeArrest(d: ArrestRecord) {
  return {
    year: d.year ?? d.data_year ?? null,
    totalArrests: d.total_arrests ?? d.value ?? d.arrest_count ?? null,
  };
}

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "fbi_crime_national",
    description:
      "Get national crime estimates from the FBI UCR program. " +
      "Shows estimated totals for violent crime, property crime, and subcategories.",
    annotations: { title: "FBI: National Crime Estimates", readOnlyHint: true },
    parameters: z.object({
      start_year: z.number().int().optional().describe("Start year (default: 5 years ago)"),
      end_year: z.number().int().optional().describe("End year (default: latest)"),
    }),
    execute: async ({ start_year, end_year }) => {
      const results = await getNationalCrime(start_year, end_year);
      if (!results.length) return JSON.stringify({ summary: "No national crime data found.", years: [] });
      return JSON.stringify({
        summary: `National crime estimates: ${results.length} years of data`,
        location: "United States",
        years: results.slice(0, 20).map(summarizeCrime),
      });
    },
  },

  {
    name: "fbi_crime_by_state",
    description:
      "Get crime statistics for a U.S. state from the FBI's Uniform Crime Reporting (UCR) program. " +
      "Returns estimated totals for major offense categories. Uses state abbreviations: CA, TX, NY, FL, etc.",
    annotations: { title: "FBI: Crime Statistics by State", readOnlyHint: true },
    parameters: z.object({
      state: z.string().describe("Two-letter state abbreviation (e.g., 'CA', 'TX', 'NY')"),
      start_year: z.number().int().optional().describe("Start year (default: 5 years ago)"),
      end_year: z.number().int().optional().describe("End year (default: latest available)"),
    }),
    execute: async ({ state, start_year, end_year }) => {
      const stateAbbr = state.toUpperCase();
      const results = await getCrimeByState(stateAbbr, start_year, end_year);
      if (!results.length) return JSON.stringify({ summary: `No crime data found for ${stateAbbr}.`, state: stateAbbr, years: [] });
      return JSON.stringify({
        summary: `Crime estimates for ${stateAbbr}: ${results.length} years of data`,
        state: stateAbbr,
        years: results.slice(0, 20).map(summarizeCrime),
      });
    },
  },

  {
    name: "fbi_arrest_data",
    description:
      "Get arrest statistics from the FBI. Can filter by offense type and state.",
    annotations: { title: "FBI: Arrest Data", readOnlyHint: true },
    parameters: z.object({
      state: z.string().optional().describe("Two-letter state abbreviation. Omit for national."),
      offense: z.string().optional().describe(
        "Offense category. Common: 'aggravated-assault', 'burglary', 'larceny', " +
        "'motor-vehicle-theft', 'homicide', 'rape', 'robbery', 'arson', 'drug-abuse'"
      ),
      start_year: z.number().int().optional().describe("Start year"),
      end_year: z.number().int().optional().describe("End year"),
    }),
    execute: async ({ state, offense, start_year, end_year }) => {
      const results = await getArrestData({
        state, offense, startYear: start_year, endYear: end_year,
      });
      const location = state?.toUpperCase() ?? "National";
      if (!results.length) return JSON.stringify({ summary: "No arrest data found.", location, offense: offense ?? null, years: [] });
      return JSON.stringify({
        summary: `Arrest data for ${location}${offense ? ` (${offense})` : ""}: ${results.length} records`,
        location,
        offense: offense ?? null,
        years: results.slice(0, 30).map(summarizeArrest),
      });
    },
  },
];

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "crime_overview",
    description: "National and state crime trends overview.",
    load: async () =>
      "Build a crime statistics overview:\n\n" +
      "1. Use fbi_crime_national for the last 5 available years\n" +
      "2. Compare violent crime vs property crime trends\n" +
      "3. Show the 5 states with highest and lowest crime rates using fbi_crime_by_state\n\n" +
      "Present trends objectively. Note any data methodology changes that affect comparisons.",
  },
];

// ─── Re-export cache control from SDK ────────────────────────────────

export { clearCache } from "../sdk/fbi.js";

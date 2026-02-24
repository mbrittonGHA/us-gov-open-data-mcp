/**
 * NAEP (Nation's Report Card) MCP module — test scores, achievement levels, and gaps.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import {
  getScores,
  getAchievementLevels,
  compareAcrossYears,
  compareAcrossJurisdictions,
  compareAcrossGroups,
  SUBJECTS,
  VARIABLES,
  STAT_TYPES,
  JURISDICTIONS,
} from "../sdk/naep.js";

// ─── Metadata ────────────────────────────────────────────────────────

export const name = "naep";
export const displayName = "NAEP (Nation's Report Card)";
export const description = "National Assessment of Educational Progress: reading, math, science test scores by state, grade, race, gender, school lunch eligibility — the gold standard for U.S. education measurement";
export const workflow = "naep_scores for current data, naep_achievement_levels for proficiency %, naep_compare_years for trends, naep_compare_states for state rankings";
export const tips =
  "Subjects: 'reading', 'math', 'science', 'writing', 'civics', 'history'. " +
  "Grades: 4, 8, 12. Jurisdiction codes: 'NP' (national public), or state abbreviations (CA, TX, NY). " +
  "Variables: 'TOTAL' (all students), 'SDRACE' (race), 'GENDER', 'SLUNCH3' (poverty/lunch eligibility). " +
  "Years: use specific years like '2022' or 'Current'. NAEP is assessed every 2 years.";

export const reference = {
  subjects: SUBJECTS,
  variables: VARIABLES,
  statTypes: STAT_TYPES,
  docs: {
    "NAEP Data Explorer": "https://www.nationsreportcard.gov/ndecore/landing",
    "API Documentation": "https://www.nationsreportcard.gov/api_documentation.aspx",
    "Assessment Schedule": "https://nces.ed.gov/nationsreportcard/about/assessmentsched.aspx",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "naep_scores",
    description:
      "Get NAEP test scores (Nation's Report Card) — the gold standard for measuring U.S. student achievement.\n" +
      "Returns average scale scores by subject, grade, state, and demographic group.\n\n" +
      "Subjects: 'reading', 'math', 'science', 'writing', 'civics', 'history', 'geography'\n" +
      "Grades: 4, 8, 12\n" +
      "Variables: 'TOTAL' (all students), 'SDRACE' (race), 'GENDER', 'SLUNCH3' (school lunch/poverty), 'PARED' (parent education)\n" +
      "Jurisdiction: 'NP' (national public), or state codes ('CA', 'TX', 'NY', 'MS')",
    annotations: { title: "NAEP: Test Scores", readOnlyHint: true },
    parameters: z.object({
      subject: z.string().describe("'reading', 'math', 'science', 'writing', 'civics', 'history', 'geography'"),
      grade: z.number().int().describe("4, 8, or 12"),
      variable: z.string().optional().describe("'TOTAL' (default), 'SDRACE' (race), 'GENDER', 'SLUNCH3' (poverty), 'PARED' (parent ed), 'IEP' (disability), 'LEP' (English learners)"),
      jurisdiction: z.string().optional().describe("'NP' (national public, default), or state codes: 'CA', 'TX', 'NY', 'MS', 'MA'. Comma-separate for multiple."),
      year: z.string().optional().describe("Assessment year: '2022', '2019', '2017'. Default: most recent. Use 'Current' for latest."),
      stat_type: z.string().optional().describe("'MN:MN' (mean score, default), 'ALC:AP' (% at/above proficient), 'ALC:BB' (% below basic)"),
    }),
    execute: async ({ subject, grade, variable, jurisdiction, year, stat_type }) => {
      const data = await getScores({
        subject, grade,
        variable: variable || "TOTAL",
        jurisdiction: jurisdiction || "NP",
        year: year || "Current",
        stattype: stat_type,
      });
      if (!data.result?.length) return `No NAEP data found for ${subject} grade ${grade}.`;
      return JSON.stringify({
        summary: `NAEP ${subject} grade ${grade}: ${data.result.length} data points`,
        results: data.result.map(r => ({
          year: r.year, jurisdiction: r.jurisdiction,
          variable: r.variable, category: r.varValueLabel || r.varValue,
          value: r.value, standardError: r.se, errorFlag: r.errorFlag,
        })),
      });
    },
  },

  {
    name: "naep_achievement_levels",
    description:
      "Get the percentage of students at each NAEP achievement level: Below Basic, Basic, Proficient, Advanced.\n" +
      "THIS IS THE KEY LITERACY/NUMERACY METRIC — shows what % of students can read/do math at grade level.\n" +
      "Example: '37% of 4th graders scored Below Basic in reading' comes from this data.",
    annotations: { title: "NAEP: Achievement Levels", readOnlyHint: true },
    parameters: z.object({
      subject: z.string().describe("'reading', 'math', 'science'"),
      grade: z.number().int().describe("4, 8, or 12"),
      variable: z.string().optional().describe("'TOTAL' (default), 'SDRACE' (race), 'GENDER', 'SLUNCH3' (poverty)"),
      jurisdiction: z.string().optional().describe("'NP' (national, default), or state codes"),
      year: z.string().optional().describe("Year: '2022', '2019'. Default: most recent"),
    }),
    execute: async ({ subject, grade, variable, jurisdiction, year }) => {
      const data = await getAchievementLevels({
        subject, grade,
        variable: variable || "TOTAL",
        jurisdiction: jurisdiction || "NP",
        year: year || "Current",
      });
      if (!data.result?.length) return `No achievement level data found for ${subject} grade ${grade}.`;
      return JSON.stringify({
        summary: `NAEP achievement levels: ${subject} grade ${grade}, ${data.result.length} data points`,
        results: data.result.map(r => ({
          year: r.year, jurisdiction: r.jurisdiction,
          variable: r.variable, category: r.varValueLabel || r.varValue,
          statType: r.stattype, value: r.value, standardError: r.se,
        })),
      });
    },
  },

  {
    name: "naep_compare_years",
    description:
      "Compare NAEP scores across assessment years with significance testing.\n" +
      "Shows whether score changes between years are statistically significant.\n" +
      "Great for tracking the COVID learning loss and recovery.",
    annotations: { title: "NAEP: Compare Across Years", readOnlyHint: true },
    parameters: z.object({
      subject: z.string().describe("'reading', 'math', 'science'"),
      grade: z.number().int().describe("4, 8, or 12"),
      years: z.string().describe("Comma-separated years to compare: '2022,2019' or '2022,2019,2017'"),
      variable: z.string().optional().describe("'TOTAL' (default), 'SDRACE', 'GENDER', 'SLUNCH3'"),
      jurisdiction: z.string().optional().describe("'NP' (default), or state codes"),
    }),
    execute: async ({ subject, grade, years, variable, jurisdiction }) => {
      const data = await compareAcrossYears({
        subject, grade, years,
        variable: variable || "TOTAL",
        jurisdiction: jurisdiction || "NP",
      });
      if (!data.result?.length) return `No comparison data found.`;
      return JSON.stringify({
        summary: `NAEP year comparison: ${subject} grade ${grade}, years ${years}`,
        results: data.result.map((r: any) => ({
          year: r.year, jurisdiction: r.jurisdiction,
          category: r.varValueLabel || r.varValue,
          focalValue: r.focalValue, targetValue: r.targetValue,
          gap: r.gap, significance: r.significance ?? r.sig,
        })),
      });
    },
  },

  {
    name: "naep_compare_states",
    description:
      "Compare NAEP scores across states/jurisdictions with significance testing.\n" +
      "Shows which states score significantly higher or lower than others.\n" +
      "Example: Compare Massachusetts vs Mississippi reading scores.",
    annotations: { title: "NAEP: Compare States", readOnlyHint: true },
    parameters: z.object({
      subject: z.string().describe("'reading', 'math', 'science'"),
      grade: z.number().int().describe("4, 8, or 12"),
      jurisdictions: z.string().describe("Comma-separated jurisdiction codes: 'NP,CA,TX,MS,MA' or 'NP,NY'"),
      variable: z.string().optional().describe("'TOTAL' (default), 'SDRACE', 'GENDER'"),
      year: z.string().optional().describe("Year: '2022'. Default: most recent"),
    }),
    execute: async ({ subject, grade, jurisdictions, variable, year }) => {
      const data = await compareAcrossJurisdictions({
        subject, grade, jurisdictions,
        variable: variable || "TOTAL",
        year: year || "Current",
      });
      if (!data.result?.length) return `No comparison data found.`;
      return JSON.stringify({
        summary: `NAEP state comparison: ${subject} grade ${grade}, jurisdictions ${jurisdictions}`,
        results: data.result.map((r: any) => ({
          year: r.year, jurisdiction: r.jurisdiction,
          category: r.varValueLabel || r.varValue,
          focalValue: r.focalValue, targetValue: r.targetValue,
          gap: r.gap, significance: r.significance ?? r.sig,
        })),
      });
    },
  },

  {
    name: "naep_compare_groups",
    description:
      "Compare NAEP scores across demographic groups (race, gender, poverty) with significance testing.\n" +
      "Shows achievement gaps between groups (e.g., White vs Black, Male vs Female, eligible vs not eligible for free lunch).",
    annotations: { title: "NAEP: Achievement Gaps", readOnlyHint: true },
    parameters: z.object({
      subject: z.string().describe("'reading', 'math', 'science'"),
      grade: z.number().int().describe("4, 8, or 12"),
      variable: z.string().describe("'SDRACE' (race gap), 'GENDER' (gender gap), 'SLUNCH3' (poverty gap), 'IEP' (disability gap), 'LEP' (ELL gap)"),
      jurisdiction: z.string().optional().describe("'NP' (default), or state codes"),
      year: z.string().optional().describe("Year: '2022'. Default: most recent"),
    }),
    execute: async ({ subject, grade, variable, jurisdiction, year }) => {
      const data = await compareAcrossGroups({
        subject, grade, variable,
        jurisdiction: jurisdiction || "NP",
        year: year || "Current",
      });
      if (!data.result?.length) return `No gap data found.`;
      return JSON.stringify({
        summary: `NAEP achievement gaps: ${subject} grade ${grade}, by ${variable}`,
        results: data.result.map((r: any) => ({
          year: r.year, jurisdiction: r.jurisdiction,
          focalCategory: r.focalVarValueLabel || r.focalVarValue,
          targetCategory: r.targetVarValueLabel || r.targetVarValue,
          focalValue: r.focalValue, targetValue: r.targetValue,
          gap: r.gap, significance: r.significance ?? r.sig,
        })),
      });
    },
  },
];

// ─── Prompts ─────────────────────────────────────────────────────────

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "education_report_card",
    description: "Comprehensive U.S. education snapshot: NAEP scores, achievement levels, trends, and demographic gaps.",
    load: async () =>
      "Build a comprehensive education report card:\n\n" +
      "1. Use naep_scores for 4th grade reading (NP, TOTAL, 2022) — current national average\n" +
      "2. Use naep_achievement_levels for 4th grade reading — what % are below basic, proficient, etc.\n" +
      "3. Use naep_compare_years for 4th grade reading years 2022,2019,2017 — track COVID impact\n" +
      "4. Use naep_compare_groups for 4th grade reading by SDRACE — racial achievement gap\n" +
      "5. Use naep_compare_groups for 4th grade reading by SLUNCH3 — poverty achievement gap\n" +
      "6. Repeat steps 1-2 for 4th grade math\n" +
      "7. Use naep_compare_states for reading grade 4: NP,MA,MS,CA,TX — highest vs lowest states\n\n" +
      "Cross-reference with Census poverty data and CDC PLACES health data to show how poverty, food insecurity, and health correlate with test scores.",
  },
];

export { clearCache } from "../sdk/naep.js";

/**
 * NAEP (Nation's Report Card) SDK — typed API client for the NAEP Data Service API.
 *
 * API docs: https://www.nationsreportcard.gov/api_documentation.aspx
 * No API key required. Returns JSON.
 *
 * Usage:
 *   import { getScores, getAchievementLevels, compareAcrossYears } from "us-gov-open-data-mcp/sdk/naep";
 *   const scores = await getScores({ subject: "reading", grade: 4, year: "2022" });
 */

import { createClient } from "../client.js";

const api = createClient({
  baseUrl: "https://www.nationsreportcard.gov",
  name: "naep",
  rateLimit: { perSecond: 3, burst: 6 },
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours — NAEP data updates ~every 2 years
  timeoutMs: 30_000,
});

// ─── Types ───────────────────────────────────────────────────────────

export interface NaepResult {
  year: string;
  sample: string;
  cohort: string;
  jurisdiction: string;
  stattype: string;
  subject: string;
  grade: string;
  subscale: string;
  variable: string;
  varValue: string;
  varValueLabel: string;
  value: string;
  se: string;
  errorFlag: number;
  [key: string]: unknown;
}

export interface NaepResponse {
  status: number;
  result: NaepResult[];
}

export interface NaepGapResult extends NaepResult {
  focalValue: string;
  targetValue: string;
  gap: string;
  significance: string;
}

// ─── Reference Data ──────────────────────────────────────────────────

/** Common subject + subscale codes */
export const SUBJECTS: Record<string, { code: string; subscale: string; label: string }> = {
  reading: { code: "reading", subscale: "RRPCM", label: "Reading (composite)" },
  math: { code: "mathematics", subscale: "MRPCM", label: "Mathematics (composite)" },
  science: { code: "science", subscale: "SRPUV", label: "Science (overall)" },
  writing: { code: "writing", subscale: "WRIRP", label: "Writing" },
  civics: { code: "civics", subscale: "CIVRP", label: "Civics" },
  history: { code: "history", subscale: "HRPCM", label: "U.S. History (composite)" },
  geography: { code: "geography", subscale: "GRPCM", label: "Geography (composite)" },
};

/** Common variable codes */
export const VARIABLES: Record<string, string> = {
  TOTAL: "All students",
  GENDER: "Gender (Male/Female)",
  SDRACE: "Race/ethnicity (trend reporting)",
  SRACE10: "Race/ethnicity (2011 guidelines)",
  SLUNCH3: "School lunch eligibility (poverty proxy)",
  PARED: "Parental education level",
  SCHTYPE: "School type (public/nonpublic)",
  CHRTRPT: "Charter school status",
  UTOL4: "School location (city/suburb/town/rural)",
  CENSREG: "Census region",
  IEP: "Disability status (IEP/504)",
  LEP: "English language learner status",
};

/** Stat type codes */
export const STAT_TYPES: Record<string, string> = {
  "MN:MN": "Average scale score (mean)",
  "ALC:BB": "% Below Basic",
  "ALC:AB": "% At or Above Basic",
  "ALC:AP": "% At or Above Proficient",
  "ALC:AD": "% At Advanced",
  "ALD:BA": "% At Basic (discrete)",
  "ALD:PR": "% At Proficient (discrete)",
  "ALD:AD": "% At Advanced (discrete)",
  "PC:P1": "10th percentile score",
  "PC:P5": "50th percentile score",
  "PC:P9": "90th percentile score",
};

/** State jurisdiction codes */
export const JURISDICTIONS: Record<string, string> = {
  NP: "National public",
  NT: "National total",
  NR: "National private",
  NL: "Large city",
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveSubject(subjectInput: string): { subject: string; subscale: string } {
  const lower = subjectInput.toLowerCase().trim();
  const entry = SUBJECTS[lower];
  if (entry) return { subject: entry.code, subscale: entry.subscale };
  // Allow raw codes
  return { subject: subjectInput, subscale: subjectInput.toUpperCase() };
}

// ─── Public API ──────────────────────────────────────────────────────

/** Get NAEP scores (mean, percentiles, or achievement levels) by subject, grade, jurisdiction, and variable. */
export async function getScores(opts: {
  subject: string;
  grade: number;
  variable?: string;
  jurisdiction?: string;
  stattype?: string;
  year?: string;
  subscale?: string;
}): Promise<NaepResponse> {
  const resolved = resolveSubject(opts.subject);
  const params: Record<string, string> = {
    type: "data",
    subject: resolved.subject,
    grade: String(opts.grade),
    subscale: opts.subscale || resolved.subscale,
    variable: opts.variable || "TOTAL",
    jurisdiction: opts.jurisdiction || "NP",
    stattype: opts.stattype || "MN:MN",
    Year: opts.year || "Current",
  };
  return api.get<NaepResponse>("/Dataservice/GetAdhocData.aspx", params);
}

/** Get achievement level percentages (Below Basic, Basic, Proficient, Advanced). */
export async function getAchievementLevels(opts: {
  subject: string;
  grade: number;
  variable?: string;
  jurisdiction?: string;
  year?: string;
}): Promise<NaepResponse> {
  const resolved = resolveSubject(opts.subject);
  const params: Record<string, string> = {
    type: "data",
    subject: resolved.subject,
    grade: String(opts.grade),
    subscale: resolved.subscale,
    variable: opts.variable || "TOTAL",
    jurisdiction: opts.jurisdiction || "NP",
    stattype: "ALC:BB,ALC:AB,ALC:AP,ALC:AD",
    Year: opts.year || "Current",
  };
  return api.get<NaepResponse>("/Dataservice/GetAdhocData.aspx", params);
}

/** Compare scores across years (significance testing). */
export async function compareAcrossYears(opts: {
  subject: string;
  grade: number;
  years: string;
  variable?: string;
  jurisdiction?: string;
}): Promise<NaepResponse> {
  const resolved = resolveSubject(opts.subject);
  const params: Record<string, string> = {
    type: "sigacrossyear",
    subject: resolved.subject,
    grade: String(opts.grade),
    subscale: resolved.subscale,
    variable: opts.variable || "TOTAL",
    jurisdiction: opts.jurisdiction || "NP",
    stattype: "MN:MN",
    Year: opts.years,
  };
  return api.get<NaepResponse>("/Dataservice/GetAdhocData.aspx", params);
}

/** Compare scores across jurisdictions (states/districts). */
export async function compareAcrossJurisdictions(opts: {
  subject: string;
  grade: number;
  jurisdictions: string;
  variable?: string;
  year?: string;
}): Promise<NaepResponse> {
  const resolved = resolveSubject(opts.subject);
  const params: Record<string, string> = {
    type: "sigacrossjuris",
    subject: resolved.subject,
    grade: String(opts.grade),
    subscale: resolved.subscale,
    variable: opts.variable || "TOTAL",
    jurisdiction: opts.jurisdictions,
    stattype: "MN:MN",
    Year: opts.year || "Current",
  };
  return api.get<NaepResponse>("/Dataservice/GetAdhocData.aspx", params);
}

/** Compare scores across demographic groups (race, gender, etc.). */
export async function compareAcrossGroups(opts: {
  subject: string;
  grade: number;
  variable: string;
  jurisdiction?: string;
  year?: string;
}): Promise<NaepResponse> {
  const resolved = resolveSubject(opts.subject);
  const params: Record<string, string> = {
    type: "sigacrossvalue",
    subject: resolved.subject,
    grade: String(opts.grade),
    subscale: resolved.subscale,
    variable: opts.variable,
    jurisdiction: opts.jurisdiction || "NP",
    stattype: "MN:MN",
    Year: opts.year || "Current",
  };
  return api.get<NaepResponse>("/Dataservice/GetAdhocData.aspx", params);
}

export function clearCache(): void { api.clearCache(); }

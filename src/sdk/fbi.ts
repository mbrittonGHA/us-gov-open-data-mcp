/**
 * FBI Crime Data Explorer SDK — typed API client.
 *
 * Standalone — no MCP server required. Usage:
 *
 *   import { getCrimeByState, getNationalCrime } from "us-gov-open-data/sdk/fbi";
 *
 * Requires DATA_GOV_API_KEY env var. Get one at https://api.data.gov/signup/
 * Docs: https://crime-data-explorer.fr.cloud.gov/pages/docApi
 */

import { createClient } from "../client.js";

// ─── Client ──────────────────────────────────────────────────────────

const api = createClient({
  baseUrl: "https://api.usa.gov/crime/fbi/sapi",
  name: "fbi",
  auth: { type: "query", key: "API_KEY", envVar: "DATA_GOV_API_KEY" },
  cacheTtlMs: 60 * 60 * 1000, // 1 hour — crime data updates infrequently
});

// ─── Types ───────────────────────────────────────────────────────────

export interface CrimeEstimate {
  year?: number;
  data_year?: number;
  population?: number;
  violent_crime?: number;
  property_crime?: number;
  homicide?: number;
  robbery?: number;
  aggravated_assault?: number;
  burglary?: number;
  larceny?: number;
  motor_vehicle_theft?: number;
  rape?: number;
  arson?: number;
  [key: string]: unknown;
}

export interface ArrestRecord {
  year?: number;
  data_year?: number;
  total_arrests?: number;
  value?: number;
  arrest_count?: number;
  [key: string]: unknown;
}

// ─── Internal: extract results from inconsistent response shapes ─────

function extractResults<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (typeof res === "object" && res !== null) {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

// ─── Public API ──────────────────────────────────────────────────────

/** Get crime estimates for a U.S. state. */
export async function getCrimeByState(
  state: string,
  startYear?: number,
  endYear?: number,
): Promise<CrimeEstimate[]> {
  const stateAbbr = state.toUpperCase();
  const start = startYear ?? new Date().getFullYear() - 5;
  const end = endYear ?? new Date().getFullYear();
  const res = await api.get(`/api/estimates/states/${stateAbbr}/${start}/${end}`);
  return extractResults<CrimeEstimate>(res);
}

/** Get national crime estimates. */
export async function getNationalCrime(
  startYear?: number,
  endYear?: number,
): Promise<CrimeEstimate[]> {
  const start = startYear ?? new Date().getFullYear() - 5;
  const end = endYear ?? new Date().getFullYear();
  const res = await api.get(`/api/estimates/national/${start}/${end}`);
  return extractResults<CrimeEstimate>(res);
}

/** Get arrest statistics. Optionally filter by state and/or offense. */
export async function getArrestData(opts: {
  state?: string;
  offense?: string;
  startYear?: number;
  endYear?: number;
} = {}): Promise<ArrestRecord[]> {
  const start = opts.startYear ?? new Date().getFullYear() - 5;
  const end = opts.endYear ?? new Date().getFullYear();

  let path: string;
  if (opts.state && opts.offense) {
    path = `/api/arrest/states/offense/${opts.state.toUpperCase()}/${opts.offense}/${start}/${end}`;
  } else if (opts.state) {
    path = `/api/arrest/states/${opts.state.toUpperCase()}/${start}/${end}`;
  } else {
    path = `/api/arrest/national/${start}/${end}`;
  }

  const res = await api.get(path);
  return extractResults<ArrestRecord>(res);
}

/** Clear cached responses. */
export function clearCache(): void {
  api.clearCache();
}

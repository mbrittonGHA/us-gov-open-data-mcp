/**
 * FRED SDK — typed API client for FRED (Federal Reserve Economic Data).
 *
 * Standalone — no MCP server required. Usage:
 *
 *   import { getObservations, searchSeries } from "us-gov-open-data/sdk/fred";
 *
 *   const gdp = await getObservations("GDP", { start: "2024-01-01" });
 *   console.log(gdp.observations);
 *
 * Requires FRED_API_KEY env var. Get one at https://fredaccount.stlouisfed.org/apikeys
 */

import { createClient } from "../client.js";

// ─── Client ──────────────────────────────────────────────────────────

const api = createClient({
  baseUrl: "https://api.stlouisfed.org",
  name: "fred",
  auth: { type: "query", key: "api_key", envVar: "FRED_API_KEY", extraParams: { file_type: "json" } },
  rateLimit: { perSecond: 2, burst: 5 },
  cacheTtlMs: 60 * 60 * 1000, // 1 hour — FRED data updates a few times/day at most
});

// ─── Types ───────────────────────────────────────────────────────────

export interface FredSeries {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal_adjustment: string;
  last_updated: string;
  popularity: number;
  notes: string;
  observation_start: string;
  observation_end: string;
}

export interface FredSearchResult {
  count: number;
  seriess: FredSeries[];
}

export interface FredObservation {
  date: string;
  value: string;
}

export interface FredObservations {
  count: number;
  observation_start: string;
  observation_end: string;
  observations: FredObservation[];
}

export interface FredReleaseSeries {
  series_id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal_adjustment: string;
  observations: FredObservation[];
}

export interface FredReleaseResult {
  has_more: boolean;
  next_cursor?: string;
  release: { release_id: number; name: string };
  series: FredReleaseSeries[];
}

// ─── Public API ──────────────────────────────────────────────────────

/** Search FRED series by keyword. */
export async function searchSeries(query: string, limit = 20): Promise<FredSearchResult> {
  return api.get<FredSearchResult>("/fred/series/search", {
    search_text: query, limit, order_by: "search_rank",
  });
}

/** Get metadata for a single series. */
export async function getSeriesInfo(seriesId: string): Promise<FredSeries | null> {
  const data = await api.get<{ seriess: FredSeries[] }>("/fred/series", {
    series_id: seriesId.toUpperCase(),
  });
  return data.seriess?.[0] ?? null;
}

/** Get observation values for a series. */
export async function getObservations(seriesId: string, opts: {
  start?: string;
  end?: string;
  limit?: number;
  sort?: "asc" | "desc";
  frequency?: string;
} = {}): Promise<FredObservations> {
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  return api.get<FredObservations>("/fred/series/observations", {
    series_id: seriesId.toUpperCase(),
    observation_start: opts.start ?? tenYearsAgo.toISOString().split("T")[0],
    observation_end: opts.end,
    limit: opts.limit ?? 1000,
    sort_order: opts.sort ?? "desc",
    frequency: opts.frequency,
  });
}

/** Bulk fetch all series in a FRED release (v2 API). */
export async function getReleaseData(releaseId: number, limit?: number): Promise<FredReleaseResult> {
  return api.get<FredReleaseResult>("/fred/v2/release/observations", {
    release_id: releaseId, format: "json", ...(limit ? { limit } : {}),
  });
}

/** Clear cached responses. */
export function clearCache(): void {
  api.clearCache();
}

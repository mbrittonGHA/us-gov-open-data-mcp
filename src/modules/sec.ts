/**
 * SEC EDGAR MCP module — tools + metadata. Delegates all API calls to sdk/sec.
 *
 * Tools return raw JSON data — no markdown formatting. The client decides how to present it.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import {
  getCompanyByCik,
  getCompanyFacts,
  searchEdgar,
  extractConceptData,
  summarizeFinancials,
  xbrlConcepts,
  type SecFiling,
} from "../sdk/sec.js";

// ─── Metadata (server.ts reads these) ────────────────────────────────

export const name = "sec";
export const displayName = "SEC EDGAR";
export const description = "Company filings, financial data (XBRL), and full-text search across SEC EDGAR";
export const workflow = "sec_filing_search to find companies/CIKs → sec_company_search for details → sec_company_financials for XBRL data";
export const tips = "No API key required. Rate limit: 10 req/sec. CIK numbers must be looked up first — use sec_filing_search to find them by company name.";

export const reference = {
  xbrlConcepts: xbrlConcepts as Record<string, string>,
  commonCiks: {
    "0000320193": "Apple",
    "0000789019": "Microsoft",
    "0001018724": "Amazon",
    "0000936468": "Lockheed Martin",
    "0000101829": "Raytheon (RTX)",
    "0000012927": "Boeing",
    "0000040533": "General Dynamics",
    "0001133421": "Northrop Grumman",
  } as Record<string, string>,
  docs: {
    "Developer Resources": "https://www.sec.gov/about/developer-resources",
    "EDGAR APIs": "https://www.sec.gov/page/edgar-application-programming-interfaces-old",
    "Full-Text Search": "https://efts.sec.gov/LATEST/",
    "Fair Access Policy": "https://www.sec.gov/privacy.htm#security",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "sec_company_search",
    description:
      "Look up a company on SEC EDGAR by CIK number. Returns company name, " +
      "tickers, SIC code, state, and recent filings list.\n\n" +
      "Common CIK numbers:\n" +
      "- Apple: 0000320193\n" +
      "- Microsoft: 0000789019\n" +
      "- Amazon: 0001018724\n" +
      "- Lockheed Martin: 0000936468\n" +
      "- Raytheon (RTX): 0000101829\n" +
      "- Boeing: 0000012927\n\n" +
      "To find CIK: search by company name using sec_filing_search.",
    annotations: { title: "SEC: Company Lookup", readOnlyHint: true },
    parameters: z.object({
      cik: z.string().describe("10-digit CIK number (e.g., '0000320193' for Apple). Leading zeros optional."),
    }),
    execute: async ({ cik }) => {
      const res = await getCompanyByCik(cik);

      const filings = res.filings?.recent;
      const forms = filings?.form || [];
      const dates = filings?.filingDate || [];
      const descriptions = filings?.primaryDocDescription || [];
      const accessions = filings?.accessionNumber || [];

      // Last 15 non-insider filings (skip Form 3, 4, 5, 144)
      const majorFilings: SecFiling[] = [];
      for (let i = 0; i < forms.length && majorFilings.length < 15; i++) {
        if (["3", "4", "5", "144"].includes(forms[i])) continue;
        majorFilings.push({
          form: forms[i],
          date: dates[i],
          description: descriptions[i] || "No description",
          accessionNumber: accessions[i],
        });
      }

      return JSON.stringify({
        summary: `SEC EDGAR: ${res.name || "Unknown"} (CIK ${res.cik}) — ${res.tickers?.join(", ") || "no tickers"}`,
        company: {
          cik: res.cik,
          name: res.name,
          tickers: res.tickers || [],
          exchanges: res.exchanges || [],
          sic: res.sic,
          sicDescription: res.sicDescription,
          stateOfIncorporation: res.stateOfIncorporation,
          entityType: res.entityType,
          category: res.category,
          fiscalYearEnd: res.fiscalYearEnd,
          formerNames: res.formerNames || [],
        },
        recentFilings: majorFilings,
      });
    },
  },

  {
    name: "sec_company_financials",
    description:
      "Get financial data (revenue, net income, assets, etc.) from SEC XBRL filings for a company. " +
      "Returns standardized financial data extracted from 10-K and 10-Q filings.\n\n" +
      "Requires CIK number. Use sec_company_search to look up filings first.\n\n" +
      "Common XBRL concepts: Revenues, NetIncomeLoss, Assets, Liabilities, " +
      "StockholdersEquity, EarningsPerShareBasic, CashAndCashEquivalentsAtCarryingValue",
    annotations: { title: "SEC: Company Financial Facts", readOnlyHint: true },
    parameters: z.object({
      cik: z.string().describe("10-digit CIK number (e.g., '0000320193' for Apple)"),
      metric: z.string().optional().describe(
        "Specific XBRL concept to retrieve (e.g., 'Revenues', 'NetIncomeLoss', 'Assets'). " +
        "Omit to get a summary of available key metrics.",
      ),
    }),
    execute: async ({ cik, metric }) => {
      const facts = await getCompanyFacts(cik);
      const usgaap = facts.facts["us-gaap"];

      if (!usgaap) {
        return JSON.stringify({ summary: `No US-GAAP financial data found for CIK ${cik}.`, data: null });
      }

      // Specific metric requested
      if (metric) {
        const data = extractConceptData(facts, metric);
        if (!data) {
          const available = Object.keys(usgaap).slice(0, 30);
          return JSON.stringify({
            summary: `Metric "${metric}" not found for ${facts.entityName}. Showing first 30 available metrics.`,
            availableMetrics: available,
          });
        }
        return JSON.stringify({
          summary: `${facts.entityName} — ${data.concept} (${data.label}): ${data.annual.length} annual + ${data.quarterly.length} quarterly observations`,
          entityName: facts.entityName,
          concept: data.concept,
          label: data.label,
          description: data.description,
          unit: data.unit,
          annual: data.annual.map(d => ({ period: d.end, value: d.val, filed: d.filed })),
          quarterly: data.quarterly.map(d => ({ period: d.end, value: d.val, filed: d.filed })),
        });
      }

      // Summary of key metrics
      const summary = summarizeFinancials(facts);
      return JSON.stringify({
        summary: `SEC Financial Facts: ${summary.entityName} — ${summary.keyMetrics.length} key metrics found (${summary.totalMetrics} total available)`,
        ...summary,
      });
    },
  },

  {
    name: "sec_filing_search",
    description:
      "Full-text search across all SEC EDGAR filings. " +
      "Search by company name, keyword, or topic.\n\n" +
      "Form types: 10-K (annual), 10-Q (quarterly), 8-K (current events), " +
      "DEF 14A (proxy), S-1 (IPO registration)",
    annotations: { title: "SEC: Search Filings", readOnlyHint: true },
    parameters: z.object({
      query: z.string().describe("Search query — company name, keyword, or topic"),
      forms: z.string().optional().describe("Comma-separated form types to filter: '10-K', '10-Q', '8-K', 'DEF 14A', 'S-1'"),
      start_date: z.string().optional().describe("Start date YYYY-MM-DD"),
      end_date: z.string().optional().describe("End date YYYY-MM-DD"),
    }),
    execute: async ({ query, forms, start_date, end_date }) => {
      const result = await searchEdgar(query, {
        forms,
        startDate: start_date,
        endDate: end_date,
      });

      if (result.hits.length === 0) {
        return JSON.stringify({ summary: `No filings found for "${query}".`, total: 0, filings: [] });
      }

      const filings = result.hits.slice(0, 20).map(hit => ({
        company: hit.names[0] || "?",
        form: hit.form,
        date: hit.date,
        description: hit.description,
      }));

      return JSON.stringify({
        summary: `SEC filing search "${query}": ${result.total} results, showing ${filings.length}`,
        total: result.total,
        filings,
      });
    },
  },
];

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "company_snapshot",
    description: "Quick financial overview of a public company from SEC filings.",
    arguments: [
      { name: "company", description: "Company name or ticker", required: true },
    ],
    load: async (args: any) => { const company = args?.company ?? ""; return (
      `Get a financial snapshot of ${company}:\n\n` +
      `1. Use sec_company_search to find the company and get its CIK number\n` +
      "2. Use sec_company_financials with the CIK to get recent financials\n" +
      "   Request these metrics: Revenues, NetIncomeLoss, Assets, Liabilities, EarningsPerShareDiluted\n\n" +
      "Present the last 3-4 years of financial data as a summary. Note trends in revenue, profitability, and debt levels."
    ); },
  },
];

// ─── Re-export cache control from SDK ────────────────────────────────

export { clearCache } from "../sdk/sec.js";

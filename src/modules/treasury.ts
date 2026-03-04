/**
 * Treasury Fiscal Data MCP module — tools + metadata. Delegates all API calls to sdk/treasury.
 *
 * Tools return raw JSON data — no markdown formatting. The client decides how to present it.
 */

import { z } from "zod";
import type { Tool, InputPrompt } from "fastmcp";
import {
  listDatasets,
  searchEndpoints,
  getEndpointFields,
  queryFiscalData,
  ENDPOINTS,
} from "../sdk/treasury.js";
import { tableResponse, listResponse, emptyResponse } from "../response.js";

// ─── Metadata (server.ts reads these) ────────────────────────────────

export const name = "treasury";
export const displayName = "U.S. Treasury Fiscal Data";
export const description = "National debt, revenue, spending, interest rates, exchange rates, savings bonds, auctions, trust funds — 53 datasets, 181 endpoints";
export const workflow = "search_datasets → get_endpoint_fields → query_fiscal_data";
export const tips = "No API key required. Use search_datasets to find endpoints by keyword. Use get_endpoint_fields to discover field names before querying. Sort by -record_date for latest data. Use page_size=1 for most recent record. Filter syntax: field:operator:value.";

export const reference = {
  popularEndpoints: {
    "/v2/accounting/od/debt_to_penny": "Total public debt outstanding (daily)",
    "/v2/accounting/od/avg_interest_rates": "Average interest rates on Treasury securities",
    "/v1/accounting/od/rates_of_exchange": "Treasury reporting exchange rates",
    "/v2/accounting/od/gold_reserve": "U.S. Treasury-owned gold reserves",
    "/v1/accounting/mts/mts_table_1": "Monthly Treasury Statement: receipts, outlays, deficit",
    "/v1/accounting/od/auctions_query": "Treasury securities auction data",
    "/v2/accounting/od/debt_outstanding": "Historical debt outstanding (since 1790)",
    "/v2/accounting/od/interest_expense": "Interest expense on public debt",
  } as Record<string, string>,
  filterOperators: {
    eq: "equal",
    gt: "greater than",
    gte: "greater than or equal",
    lt: "less than",
    lte: "less than or equal",
    in: "in list (comma-separated in parens)",
  } as Record<string, string>,
  docs: {
    "API Documentation": "https://fiscaldata.treasury.gov/api-documentation/",
    "Endpoint List": "https://fiscaldata.treasury.gov/api-documentation/#list-of-endpoints",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────

export const tools: Tool<any, any>[] = [
  {
    name: "list_datasets",
    description:
      "List all 53 U.S. Treasury Fiscal Data API datasets and their 181 endpoints. " +
      "Returns dataset name, data table name, API endpoint path, and description.",
    annotations: { title: "Treasury: List Datasets", readOnlyHint: true },
    parameters: z.object({}),
    execute: async () => {
      const grouped = listDatasets();
      const datasets = Object.entries(grouped).map(([name, tables]) => ({
        dataset: name,
        datasetUrl: `https://fiscaldata.treasury.gov/datasets${tables[0].slug}`,
        tables: tables.map(t => ({
          dataTable: t.dataTable,
          endpoint: t.endpoint,
          description: t.description,
        })),
      }));

      return listResponse(
        `U.S. Treasury Fiscal Data: ${Object.keys(grouped).length} datasets, ${ENDPOINTS.length} total endpoints`,
        { items: datasets },
      );
    },
  },

  {
    name: "search_datasets",
    description:
      "Search for Treasury Fiscal Data datasets and endpoints by keyword. " +
      "Searches across all 53 datasets (181 endpoints) by name, table name, endpoint path, and description.",
    annotations: { title: "Treasury: Search Datasets", readOnlyHint: true },
    parameters: z.object({
      query: z.string().describe(
        "The keyword or phrase to search for (case-insensitive). Examples: 'debt', 'exchange rate', 'gold', 'auction'",
      ),
    }),
    execute: async ({ query }) => {
      const matches = searchEndpoints(query);

      if (!matches.length) {
        return emptyResponse(`No datasets found matching "${query}". Try a broader search term.`);
      }

      const results = matches.map(ep => ({
        dataset: ep.dataset,
        dataTable: ep.dataTable,
        endpoint: ep.endpoint,
        description: ep.description,
      }));

      return listResponse(
        `Found ${matches.length} endpoint(s) matching "${query}"`,
        { items: results },
      );
    },
  },

  {
    name: "get_endpoint_fields",
    description:
      "Get field names, data types, and formats for a specific Treasury Fiscal Data API endpoint. " +
      "This helps you discover what fields are available before querying data.",
    annotations: { title: "Treasury: Get Endpoint Fields", readOnlyHint: true },
    parameters: z.object({
      endpoint: z.string().describe(
        "The API endpoint path, e.g. '/v2/accounting/od/debt_to_penny' or '/v1/accounting/dts/operating_cash_balance'",
      ),
    }),
    execute: async ({ endpoint }) => {
      const res = await getEndpointFields(endpoint);
      const fields = Object.keys(res.meta.labels);

      const fieldDetails = fields.map(f => ({
        name: f,
        label: res.meta.labels[f],
        type: res.meta.dataTypes[f] || "unknown",
        format: res.meta.dataFormats?.[f] || "unknown",
      }));

      return listResponse(
        `Endpoint ${endpoint}: ${fields.length} fields, ${res.meta["total-count"]} total records`,
        { items: fieldDetails, meta: { endpoint, totalRecords: res.meta["total-count"] } },
      );
    },
  },

  {
    name: "query_fiscal_data",
    description:
      "Query the U.S. Treasury Fiscal Data API. Supports field selection, filtering, sorting, and pagination.\n\n" +
      "Filter operators: eq (equal), gt, gte, lt, lte, in.\n" +
      "Example filter: 'record_date:gte:2024-01-01'\n" +
      "Example sort: '-record_date' (descending)\n" +
      "Multiple filters: 'country_currency_desc:in:(Canada-Dollar,Mexico-Peso),record_date:gte:2024-01-01'",
    annotations: { title: "Treasury: Query Fiscal Data", readOnlyHint: true },
    parameters: z.object({
      endpoint: z.string().describe("The API endpoint path, e.g. '/v2/accounting/od/debt_to_penny'"),
      fields: z.string().optional().describe(
        "Comma-separated list of field names to return. If omitted, all fields are returned. Example: 'record_date,tot_pub_debt_out_amt'",
      ),
      filter: z.string().optional().describe(
        "Filter expression. Format: field:operator:value. Multiple: field1:op1:val1,field2:op2:val2. " +
        "Example: 'record_date:gte:2024-01-01,security_type_desc:eq:Treasury Bills'",
      ),
      sort: z.string().optional().describe("Comma-separated list of fields to sort by. Prefix with '-' for descending. Example: '-record_date'"),
      page_number: z.number().int().positive().optional().describe("Page number (1-indexed). Default: 1"),
      page_size: z.number().int().positive().max(10000).optional().describe("Number of records per page (1-10000). Default: 100"),
    }),
    execute: async ({ endpoint, fields, filter, sort, page_number, page_size }) => {
      const res = await queryFiscalData(endpoint, {
        fields,
        filter,
        sort,
        pageNumber: page_number,
        pageSize: page_size,
      });

      return tableResponse(
        `Query ${endpoint}: ${res.meta.count} returned, ${res.meta["total-count"]} total, page ${page_number || 1} of ${res.meta["total-pages"]}`,
        {
          rows: res.data,
          total: res.meta["total-count"],
          meta: {
            endpoint,
            recordsReturned: res.meta.count,
            totalPages: res.meta["total-pages"],
          },
        },
      );
    },
  },
];

// ─── Prompts ─────────────────────────────────────────────────────────

export const prompts: InputPrompt<any, any>[] = [
  {
    name: "fiscal_snapshot",
    description: "Get a comprehensive snapshot of current U.S. fiscal data including national debt, interest rates, and recent revenue/spending.",
    load: async () =>
      "Please give me a comprehensive fiscal snapshot of the United States using the Treasury Fiscal Data API. Include:\n\n" +
      "1. **Current national debt** — query /v2/accounting/od/debt_to_penny with sort=-record_date, page_size=1, fields=record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt\n" +
      "2. **Latest average interest rates** — query /v2/accounting/od/avg_interest_rates with sort=-record_date, page_size=10, fields=record_date,security_type_desc,avg_interest_rate_amt\n" +
      "3. **Latest monthly receipts & outlays** — query /v1/accounting/mts/mts_table_1 with sort=-record_date, page_size=5\n" +
      "4. **Gold reserves** — query /v2/accounting/od/gold_reserve with sort=-record_date, page_size=5\n\n" +
      "Format the results in a clear summary with dollar amounts and dates.",
  },
  {
    name: "debt_analysis",
    description: "Analyze the national debt trend with legislative context and vote breakdowns.",
    arguments: [
      { name: "start_date", description: "Start date in YYYY-MM-DD format (default: 1 year ago)", required: false },
    ],
    load: async (args: any) => {
      const defaultDate = new Date();
      defaultDate.setFullYear(defaultDate.getFullYear() - 1);
      const startStr = args.start_date || defaultDate.toISOString().split("T")[0];
      return (
        `Analyze the U.S. national debt trend since ${startStr}.\n\n` +
        `== DEBT DATA ==\n` +
        `1. Query /v2/accounting/od/debt_to_penny with filter=record_date:gte:${startStr}, sort=-record_date, page_size=50, fields=record_date,tot_pub_debt_out_amt,debt_held_public_amt,intragov_hold_amt\n` +
        `2. Calculate the change from the earliest to latest record\n` +
        `3. Show the trend — is debt increasing or decreasing?\n` +
        `4. Break down by debt held by public vs intragovernmental holdings\n\n` +
        `== LEGISLATIVE CONTEXT ==\n` +
        `5. Use congress_search_bills for 'debt ceiling' or 'appropriations' to find relevant legislation\n` +
        `6. Use congress_house_votes and congress_senate_votes to show how each party voted on debt-related bills\n` +
        `7. Use FRED GDP series to calculate debt-to-GDP ratio for context\n\n` +
        `Present the analysis with clear numbers, percentage changes, and note which congress/president was in office.`
      );
    },
  },
  {
    name: "exchange_rates",
    description: "Look up Treasury exchange rates for a specific currency.",
    arguments: [
      { name: "currency", description: "Currency to look up, e.g. 'Euro Zone-Euro', 'Canada-Dollar', 'Japan-Yen'", required: true },
    ],
    load: async (args: any) =>
      `Get the Treasury reporting exchange rates for "${args.currency}".\n\n` +
      `Query /v1/accounting/od/rates_of_exchange with:\n` +
      `- fields: record_date,country_currency_desc,exchange_rate\n` +
      `- filter: country_currency_desc:eq:${args.currency}\n` +
      `- sort: -record_date\n- page_size: 20\n\nShow the exchange rate history and note any trends.`,
  },
  {
    name: "auction_results",
    description: "Get recent Treasury securities auction results.",
    arguments: [
      { name: "security_type", description: "Type of security: 'Bill', 'Note', 'Bond', 'TIPS', 'FRN'", required: false },
    ],
    load: async (args: any) => {
      const filterPart = args.security_type ? `\n- filter: security_type_desc:eq:${args.security_type}` : "";
      return (
        `Get the latest Treasury securities auction results.\n\n` +
        `Query /v1/accounting/od/auctions_query with:\n- sort: -auction_date\n- page_size: 15${filterPart}\n\n` +
        `Summarize the results showing auction dates, security types, amounts, and interest rates.`
      );
    },
  },
  {
    name: "interest_rate_comparison",
    description: "Compare current interest rates across all Treasury security types.",
    load: async () =>
      "Compare current average interest rates across all Treasury security types.\n\n" +
      "1. First use get_endpoint_fields on /v2/accounting/od/avg_interest_rates to see available fields\n" +
      "2. Query /v2/accounting/od/avg_interest_rates with sort=-record_date, page_size=50, fields=record_date,security_type_desc,security_desc,avg_interest_rate_amt\n" +
      "3. Group the latest rates by security type\n" +
      "4. Show which security types have the highest and lowest rates\n\n" +
      "Present as a comparison table.",
  },
];

// ─── Re-export cache control from SDK ────────────────────────────────

export { clearCache } from "../sdk/treasury.js";

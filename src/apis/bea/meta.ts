/**
 * bea module metadata.
 */


// ─── Metadata (server.ts reads these) ────────────────────────────────

export const name = "bea";
export const displayName = "Bureau of Economic Analysis";
export const category = "Economic";
export const description =
  "U.S. economic statistics: GDP (national/state/industry), personal income, international transactions, " +
  "fixed assets, multinational enterprises, input-output tables, and more. " +
  "Covers NIPA, Regional, GDPbyIndustry, ITA, IIP, MNE, FixedAssets, IntlServTrade, InputOutput datasets.";
export const auth = { envVar: "BEA_API_KEY", signup: "https://apps.bea.gov/API/signup/" };
export const workflow =
  "Use bea_dataset_info to discover datasets/parameters/valid values → " +
  "then call the appropriate dataset tool (bea_gdp_national, bea_gdp_by_state, etc.)";
export const tips =
  "Key advantages: state-level GDP and income, GDP by NAICS industry, international transactions/investment " +
  "positions, fixed assets, input-output tables. Rate limit: 100 req/min with 1-hour lockout if exceeded. " +
  "Use 'LAST5' or specific years instead of 'ALL' to limit data volume.";

export const reference = {
  datasets: {
    NIPA: "National Income and Product Accounts (GDP, income, spending)",
    NIUnderlyingDetail: "NIPA underlying detail (more granular, lower quality)",
    FixedAssets: "Fixed assets (net stock, depreciation, investment)",
    MNE: "Multinational Enterprises (direct investment, foreign affiliates)",
    GDPbyIndustry: "GDP by industry (value added, gross output, inputs)",
    Regional: "Regional data (state/county/MSA income, GDP, employment)",
    ITA: "International Transactions Accounts (balance of payments)",
    IIP: "International Investment Position (assets, liabilities)",
    InputOutput: "Input-Output statistics (make/use/requirements tables)",
    UnderlyingGDPbyIndustry: "Underlying GDP by industry (additional detail)",
    IntlServTrade: "International Services Trade",
  } as Record<string, string>,
  nipaTables: {
    T10101: "Real GDP percent change",
    T10102: "Contributions to percent change in real GDP",
    T10105: "Nominal GDP",
    T10106: "Real GDP (chained dollars)",
    T10111: "Real GDP percent change (additional detail)",
    T20100: "Personal income and its disposition",
    T20600: "Personal income (monthly)",
    T30100: "Government current receipts and expenditures",
    T30200: "Federal government receipts and expenditures",
    T30300: "State/local government receipts and expenditures",
    T40100: "Foreign transactions in NIPAs",
    T50100: "Saving and investment by sector",
    T70100: "Corporate profits",
  } as Record<string, string>,
  gdpIndustryTables: {
    1: "Value added by industry (current $)",
    5: "Contributions to percent change in real GDP",
    6: "Value added as % of GDP",
    7: "Gross output by industry",
    25: "Real value added by industry (chained $)",
  } as Record<number, string>,
  regionalTables: {
    SAGDP1: "State annual GDP summary",
    SAGDP9: "Real GDP by state",
    SQGDP1: "State quarterly GDP summary",
    SAINC1: "Personal income, population, per capita income",
    SAINC4: "Personal income by major component",
    SAINC5N: "Personal income by NAICS industry",
    SAINC30: "Economic profile",
    SAINC51: "Disposable personal income summary",
    CAGDP1: "County GDP summary",
    CAINC1: "County personal income summary",
    SARPP: "Regional price parities by state",
    SASUMMARY: "State annual income and product summary",
  } as Record<string, string>,
  itaIndicators: {
    BalGds: "Balance on goods",
    BalServ: "Balance on services",
    BalCurAcct: "Current account balance",
    ExpGds: "Exports of goods",
    ImpGds: "Imports of goods",
  } as Record<string, string>,
  iipTypes: {
    FinAssetsExclFinDeriv: "U.S. assets excl derivatives",
    FinLiabsExclFinDeriv: "U.S. liabilities excl derivatives",
    DirInvAssets: "Direct investment assets",
    DirInvLiabs: "Direct investment liabilities",
  } as Record<string, string>,
  metaMethods: {
    GetDatasetList: "List all available datasets",
    GetParameterList: "List parameters for a dataset",
    GetParameterValues: "Get valid values for a parameter",
    GetParameterValuesFiltered: "Get filtered values (e.g. LineCode for a TableName)",
  } as Record<string, string>,
  apiLimits: {
    requestsPerMinute: 100,
    dataVolumePerMinute: "100 MB",
    errorsPerMinute: 30,
    lockoutDuration: "1 hour (HTTP 429 with Retry-After: 3600)",
  },
  geoFipsSpecialValues: {
    STATE: "All states",
    COUNTY: "All counties",
    MSA: "All metropolitan statistical areas",
    TERR: "U.S. territories",
    "Two-letter PO code": "All counties in one state (e.g. NY, CA)",
  } as Record<string, string>,
  docs: {
    "User Guide": "https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf",
    "Developer Page": "https://apps.bea.gov/developers/",
    "Sign Up": "https://apps.bea.gov/API/signup/",
    "Release Schedule": "https://www.bea.gov/news/schedule",
    "Regional Definitions": "https://apps.bea.gov/regional/definitions/",
  },
};

// ─── Tools ───────────────────────────────────────────────────────────


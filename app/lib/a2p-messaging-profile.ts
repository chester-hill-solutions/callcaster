export const A2P_COMPANY_TYPES = [
  "government",
  "non-profit",
  "private",
  "public",
] as const;

export type A2pCompanyType = (typeof A2P_COMPANY_TYPES)[number];

export const A2P_STOCK_EXCHANGES = [
  "AMEX",
  "AMX",
  "ASX",
  "B3",
  "BME",
  "BSE",
  "FRA",
  "ICEX",
  "JPX",
  "JSE",
  "KRX",
  "LON",
  "NASDAQ",
  "NONE",
  "NYSE",
  "NSE",
  "OMX",
  "OTHER",
  "SEHK",
  "SGX",
  "SSE",
  "STO",
  "SWX",
  "SZSE",
  "TSX",
  "TWSE",
  "VSE",
] as const;

export type A2pStockExchange = (typeof A2P_STOCK_EXCHANGES)[number];

export function parseA2pCompanyType(value: unknown): A2pCompanyType | null {
  return A2P_COMPANY_TYPES.find((type) => type === value) ?? null;
}

export function parseA2pStockExchange(value: unknown): A2pStockExchange | null {
  return A2P_STOCK_EXCHANGES.find((exchange) => exchange === value) ?? null;
}

import { parse as parseSync } from "csv-parse/sync";

export const CSV_UTF8_BOM = "\ufeff";
export const CSV_DEFAULT_LINE_ENDING = "\r\n";

export type CsvScalar =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date;

export type CsvCell = CsvScalar | { toString(): string };

export type CsvStringOptions = {
  includeBom?: boolean;
  lineEnding?: string;
  /**
   * Neutralize spreadsheet formula injection by prefixing a single quote when
   * first non-whitespace character is one of = + - @
   */
  protectFromInjection?: boolean;
};

function stringifyScalar(value: CsvCell): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function sanitizeCsvInjection(value: string): string {
  const trimmedStart = value.replace(/^\s+/, "");
  const first = trimmedStart[0];
  if (first && ["=", "+", "-", "@"]?.includes(first)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(
  value: CsvCell,
  opts: Pick<CsvStringOptions, "protectFromInjection"> = {},
): string {
  let out = stringifyScalar(value);
  // Only apply formula-injection protection to string-like inputs so numeric
  // columns (e.g. -1) remain numeric in spreadsheets.
  const shouldProtect =
    opts.protectFromInjection &&
    (typeof value === "string" ||
      (typeof value === "object" && value !== null && !(value instanceof Date)));
  if (shouldProtect) {
    out = sanitizeCsvInjection(out);
  }

  // RFC4180-style escaping: quote if contains comma/quote/CR/LF; double quotes within quoted cell.
  if (/[",\r\n]/.test(out)) {
    return `"${out.replace(/"/g, '""')}"`;
  }
  return out;
}

export function csvRow(
  cells: CsvCell[],
  opts: Pick<CsvStringOptions, "protectFromInjection"> = {},
): string {
  return cells.map((c) => escapeCsvCell(c, opts)).join(",");
}

export function toCsvString(args: {
  headers: string[];
  rows: Array<Record<string, CsvCell>>;
  /**
   * Optional display headers. When provided, these are used for the first row,
   * while `headers` remain the lookup keys for row objects.
   */
  headerLabels?: CsvCell[];
  options?: CsvStringOptions;
}): string {
  const { headers, rows } = args;
  const options: Required<CsvStringOptions> = {
    includeBom: args.options?.includeBom ?? true,
    lineEnding: args.options?.lineEnding ?? CSV_DEFAULT_LINE_ENDING,
    protectFromInjection: args.options?.protectFromInjection ?? true,
  };

  const lines: string[] = [];
  const headerCells =
    args.headerLabels && args.headerLabels.length === headers.length
      ? args.headerLabels
      : headers;
  lines.push(csvRow(headerCells, { protectFromInjection: false }));
  for (const row of rows) {
    lines.push(
      csvRow(
        headers.map((h) => (row as Record<string, CsvCell>)[h] ?? ""),
        { protectFromInjection: options.protectFromInjection },
      ),
    );
  }

  const body = lines.join(options.lineEnding) + options.lineEnding;
  return (options.includeBom ? CSV_UTF8_BOM : "") + body;
}

export function csvResponse(args: {
  filename: string;
  csv: string;
  headers?: HeadersInit;
}): Response {
  const headers = new Headers(args.headers);
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="${args.filename}"`);
  // Avoid caching downloads that can contain sensitive data.
  headers.set("Cache-Control", "no-store");
  return new Response(args.csv, { status: 200, headers });
}

export type CSVParseResult = {
  contacts: Record<string, string>[];
  headers: string[];
};

/**
 * Parse CSV content into headers + row objects.
 *
 * - Supports quoted cells and embedded commas/newlines per csv-parse.
 * - Skips empty lines.
 * - Strips BOM if present.
 */
export function parseCSV(csvContent: string): CSVParseResult {
  const records = parseSync(csvContent, {
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as unknown[][];

  const firstRow = records[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0) {
    return { headers: [], contacts: [] };
  }

  const headers = firstRow.map((h) => String(h ?? "").trim());
  const contacts: Record<string, string>[] = [];

  for (const row of records.slice(1)) {
    if (!Array.isArray(row)) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] == null ? "" : String(row[idx]);
    });
    contacts.push(obj);
  }

  return { headers, contacts };
}
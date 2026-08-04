import { escapeCsvCell } from "@/lib/csv";

/** Convert RPC row objects to CSV (PostgREST `.csv()` replacement). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(",");
  const bodyLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h] as string | number | null)).join(","),
  );
  return [headerLine, ...bodyLines].join("\r\n");
}

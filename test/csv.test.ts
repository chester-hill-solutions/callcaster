import { describe, expect, test } from "vitest";
import {
  CSV_UTF8_BOM,
  CSV_DEFAULT_LINE_ENDING,
  csvRow,
  csvResponse,
  escapeCsvCell,
  parseCSV,
  sanitizeCsvInjection,
  toCsvString,
} from "../app/lib/csv";

describe("csv utilities", () => {
  test("includes BOM and CRLF by default", () => {
    const csv = toCsvString({
      headers: ["a"],
      rows: [{ a: "x" }],
    });
    expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);
    expect(csv).toContain("\r\n");
  });

  test("escapes quotes and wraps when needed", () => {
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });

  test("csvRow uses default options argument", () => {
    expect(csvRow(["a", "b"])).toBe("a,b");
  });

  test("stringifies nullish values as empty cell", () => {
    expect(escapeCsvCell(null as any)).toBe("");
    expect(escapeCsvCell(undefined as any)).toBe("");
  });

  test("neutralizes CSV injection when enabled", () => {
    expect(sanitizeCsvInjection("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvInjection(" @SUM(A1:A2)")).toBe("' @SUM(A1:A2)");
  });

  test("sanitizeCsvInjection returns input when empty or not a formula prefix", () => {
    expect(sanitizeCsvInjection("")).toBe("");
    expect(sanitizeCsvInjection("hello")).toBe("hello");
  });

  test("does not neutralize numeric values (e.g. -1) when passing as number", () => {
    const csv = toCsvString({
      headers: ["n"],
      rows: [{ n: -1 }],
    });
    expect(csv).toContain("\r\n-1\r\n");
  });

  test("preserves 0 and false (does not coerce to empty)", () => {
    const csv = toCsvString({
      headers: ["zero", "flag"],
      rows: [{ zero: 0, flag: false }],
    });
    expect(csv).toContain("\r\n0,false\r\n");
  });

  test("quotes cells containing CR", () => {
    expect(escapeCsvCell("a\rb")).toBe('"a\rb"');
  });

  test("protects strings that would become formulas (including after leading tab)", () => {
    const csv = toCsvString({
      headers: ["v"],
      rows: [{ v: "\t=1+1" }],
    });
    // First data row starts after BOM + header row.
    expect(csv).toContain("\r\n'\t=1+1\r\n");
  });

  test("protects string '-1' but not numeric -1", () => {
    const csv = toCsvString({
      headers: ["n1", "n2"],
      rows: [{ n1: "-1", n2: -1 }],
    });
    expect(csv).toContain("\r\n'-1,-1\r\n");
  });

  test("stringifies Date values as ISO", () => {
    const d = new Date("2020-01-01T00:00:00.000Z");
    const csv = toCsvString({ headers: ["d"], rows: [{ d }] });
    expect(csv).toContain(`\r\n${d.toISOString()}\r\n`);
  });

  test("supports headerLabels when length matches headers", () => {
    const csv = toCsvString({
      headers: ["a", "b"],
      headerLabels: ["A", "B"],
      rows: [{ a: 1, b: 2 }],
      options: { includeBom: false, lineEnding: "\n", protectFromInjection: false },
    });
    expect(csv.startsWith(CSV_UTF8_BOM)).toBe(false);
    expect(csv).toBe("A,B\n1,2\n");
  });

  test("toCsvString fills missing cells with empty string", () => {
    const csv = toCsvString({
      headers: ["a", "b"],
      rows: [{ a: "x" }],
      options: { includeBom: false, protectFromInjection: false },
    });
    expect(csv).toContain("a,b\r\nx,\r\n");
  });

  test("falls back to headers when headerLabels length mismatches", () => {
    const csv = toCsvString({
      headers: ["a", "b"],
      headerLabels: ["A"],
      rows: [{ a: 1, b: 2 }],
      options: { includeBom: false, lineEnding: CSV_DEFAULT_LINE_ENDING, protectFromInjection: false },
    });
    expect(csv).toBe(`a,b${CSV_DEFAULT_LINE_ENDING}1,2${CSV_DEFAULT_LINE_ENDING}`);
  });

  test("escapeCsvCell protects object-like string values when injection protection enabled", () => {
    const val = { toString: () => "=SUM(1,2)" };
    // Contains commas, so the result must be quoted as a CSV cell.
    expect(escapeCsvCell(val, { protectFromInjection: true })).toBe("\"'=SUM(1,2)\"");
    expect(escapeCsvCell(val, { protectFromInjection: false })).toBe("\"=SUM(1,2)\"");
  });

  test("csvResponse sets download headers and no-store", async () => {
    const res = csvResponse({ filename: "x.csv", csv: "a,b\r\n1,2\r\n" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="x.csv"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.text()).resolves.toContain("a,b");
  });

  test("parseCSV returns empty headers/contacts for empty input", () => {
    expect(parseCSV("")).toEqual({ headers: [], contacts: [] });
  });

  test("parseCSV strips BOM, trims headers, and maps rows by header", () => {
    const csv = "\ufeff  Name , Phone\r\nAlice, +1555\r\n";
    expect(parseCSV(csv)).toEqual({
      headers: ["Name", "Phone"],
      contacts: [{ Name: "Alice", Phone: " +1555" }],
    });
  });

  test("parseCSV handles quoted cells and relaxes column count", () => {
    const csv = 'a,b\r\n"hello, world",x\r\nonly_a\r\n';
    const res = parseCSV(csv);
    expect(res.headers).toEqual(["a", "b"]);
    expect(res.contacts[0]).toEqual({ a: "hello, world", b: "x" });
    // Missing columns become empty strings.
    expect(res.contacts[1]).toEqual({ a: "only_a", b: "" });
  });
});


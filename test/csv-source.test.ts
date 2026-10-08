import { describe, expect, test } from "vitest";
import { parseCSV, parseCSVWithSource } from "@/lib/csv";

describe("CSV source coordinates (#2478)", () => {
  test("retains BOM and blank-line positions before header removal", () => {
    const csv = "\ufeff\n\nName,Phone\n\nAda,123\n\nBob,456";
    const result = parseCSVWithSource(csv);
    expect(result.headerSource).toEqual({ recordNumber: 1, byteStart: 5, byteEnd: 15, startLine: 3, endLine: 3 });
    expect(result.contacts).toEqual([
      { data: { Name: "Ada", Phone: "123" }, source: { recordNumber: 2, byteStart: 17, byteEnd: 24, startLine: 5, endLine: 5 } },
      { data: { Name: "Bob", Phone: "456" }, source: { recordNumber: 3, byteStart: 26, byteEnd: 33, startLine: 7, endLine: 7 } },
    ]);
    expect(Buffer.from(csv).subarray(17, 24).toString()).toBe("Ada,123");
  });

  test("counts CRLF once inside quoted fields and preserves exact UTF-8 bytes", () => {
    const csv = '\ufeffName,Note\r\nAda,"first\r\nsecond"\r\n\r\nBé,ok\r\n';
    const result = parseCSVWithSource(csv);
    expect(result.headerSource).toEqual({ recordNumber: 1, byteStart: 3, byteEnd: 12, startLine: 1, endLine: 1 });
    expect(result.contacts).toEqual([
      { data: { Name: "Ada", Note: "first\r\nsecond" }, source: { recordNumber: 2, byteStart: 14, byteEnd: 33, startLine: 2, endLine: 3 } },
      { data: { Name: "Bé", Note: "ok" }, source: { recordNumber: 3, byteStart: 37, byteEnd: 43, startLine: 5, endLine: 5 } },
    ]);
    expect(Buffer.from(csv).subarray(14, 33).toString()).toBe('Ada,"first\r\nsecond"');
    expect(Buffer.from(csv).subarray(37, 43).toString()).toBe("Bé,ok");
  });

  test.each([
    { name: "LF", delimiter: "\n", secondStart: 11, secondEnd: 18, thirdStart: 20, thirdEnd: 27 },
    { name: "CR", delimiter: "\r", secondStart: 11, secondEnd: 18, thirdStart: 20, thirdEnd: 27 },
    { name: "CRLF", delimiter: "\r\n", secondStart: 12, secondEnd: 19, thirdStart: 23, thirdEnd: 30 },
  ])("keeps $name boundaries with skipped blank lines and an EOF row", ({ delimiter, secondStart, secondEnd, thirdStart, thirdEnd }) => {
    const csv = ["Name,Phone", "Ada,123", "", "Bob,456"].join(delimiter);
    const result = parseCSVWithSource(csv);
    expect(result.headerSource).toEqual({ recordNumber: 1, byteStart: 0, byteEnd: 10, startLine: 1, endLine: 1 });
    expect(result.contacts.map((row) => row.source)).toEqual([
      { recordNumber: 2, byteStart: secondStart, byteEnd: secondEnd, startLine: 2, endLine: 2 },
      { recordNumber: 3, byteStart: thirdStart, byteEnd: thirdEnd, startLine: 4, endLine: 4 },
    ]);
    expect(result.contacts.map((row) => Buffer.from(csv).subarray(row.source.byteStart, row.source.byteEnd).toString())).toEqual(["Ada,123", "Bob,456"]);
  });

  test("keeps the first headerless row and gives equal values different identities", () => {
    const result = parseCSVWithSource("Ada,+14165551234\nAda,+14165551234");
    expect(result.headerSource).toBeNull();
    expect(result.headers).toEqual(["Column 1", "Column 2"]);
    expect(result.contacts).toEqual([
      { data: { "Column 1": "Ada", "Column 2": "+14165551234" }, source: { recordNumber: 1, byteStart: 0, byteEnd: 16, startLine: 1, endLine: 1 } },
      { data: { "Column 1": "Ada", "Column 2": "+14165551234" }, source: { recordNumber: 2, byteStart: 17, byteEnd: 33, startLine: 2, endLine: 2 } },
    ]);
  });

  test("does not filter invalid phone rows or depend on contact values", () => {
    const result = parseCSVWithSource("Name,Phone\nBad,nope\nGood,123");
    expect(result.contacts.map(({ data, source }) => ({ phone: data.Phone, recordNumber: source.recordNumber, line: source.startLine }))).toEqual([
      { phone: "nope", recordNumber: 2, line: 2 },
      { phone: "123", recordNumber: 3, line: 3 },
    ]);
  });

  test("keeps quoted commas, escaped quotes and relaxed row widths", () => {
    const csv = 'Name,Note\n"Ada, A","said ""yes"""\nBob\nCy,ok,extra';
    const result = parseCSVWithSource(csv);
    expect(result.contacts).toEqual([
      { data: { Name: "Ada, A", Note: 'said "yes"' }, source: { recordNumber: 2, byteStart: 10, byteEnd: 33, startLine: 2, endLine: 2 } },
      { data: { Name: "Bob", Note: "" }, source: { recordNumber: 3, byteStart: 34, byteEnd: 37, startLine: 3, endLine: 3 } },
      { data: { Name: "Cy", Note: "ok" }, source: { recordNumber: 4, byteStart: 38, byteEnd: 49, startLine: 4, endLine: 4 } },
    ]);
  });

  test.each(["", "\ufeff", "\n\n", "\r\n\r\n"])("keeps empty input empty (%j)", (csv) => {
    expect(parseCSVWithSource(csv)).toEqual({ headers: [], headerSource: null, contacts: [] });
  });

  test("preserves header-only files", () => {
    expect(parseCSVWithSource("Name,Phone")).toEqual({
      headers: ["Name", "Phone"],
      headerSource: { recordNumber: 1, byteStart: 0, byteEnd: 10, startLine: 1, endLine: 1 },
      contacts: [],
    });
  });

  test.each([
    "Name,Phone\nAda,123\n", '\ufeffName,Note\r\nAda,"first\r\nsecond"\r\n',
    "Ada,+14165551234\nAda,+14165551234", "Name,Phone\nBad,nope\nBob", "Name,Phone,Phone\nAda,123,456",
    "Name,Note\rAda,tail\n", '\rName,Note\nAda,tail\n', 'Name,Note\nAda,loose"quote',
  ])("keeps compatibility values without adding metadata (%j)", (csv) => {
    const result = parseCSVWithSource(csv);
    expect({ headers: result.headers, contacts: result.contacts.map((row) => row.data) }).toEqual(parseCSV(csv));
    expect(result.contacts.every((row) => !Object.hasOwn(row.data, "source"))).toBe(true);
  });

  test("keeps unmatched quote rejection", () => {
    expect(() => parseCSVWithSource('Name,Note\nAda,"unfinished')).toThrow();
    expect(() => parseCSV('Name,Note\nAda,"unfinished')).toThrow();
  });
});

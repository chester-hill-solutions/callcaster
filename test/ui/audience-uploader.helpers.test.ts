import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    parse: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("csv-parse/sync", () => ({
  parse: (...args: any[]) => mocks.parse(...args),
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

describe("AudienceUploader CSV helpers", () => {
  test("parseCSVHeaders lowercases and trims", async () => {
    const mod = await import("@/components/audience/audience-upload-csv");
    expect(mod.parseCSVHeaders([" Name ", "PHONE", "Other_Data"])).toEqual(["name", "phone", "other_data"]);
  });

  test("parseCSVData maps case-insensitive record keys and stringifies nullish to empty", async () => {
    const mod = await import("@/components/audience/audience-upload-csv");
    const records = [{ Name: "A", PHONE: null, weird: 1 }] as any[];
    const headers = ["name", "phone", "weird"];
    expect(mod.parseCSVData(records, headers)).toEqual([{ name: "A", phone: "", weird: "1" }]);
  });

  test("parseCSVData maps missing header to empty string", async () => {
    const mod = await import("@/components/audience/audience-upload-csv");
    const records = [{ Name: "A" }] as any[];
    const headers = ["name", "phone"];
    expect(mod.parseCSVData(records, headers)).toEqual([{ name: "A", phone: "" }]);
  });

  test("parseCSV returns headers + contacts", async () => {
    // The parser now reads raw rows (columns: false) so it can decide whether
    // the first row is a header (#1511).
    mocks.parse.mockReturnValue([["Name", "Phone"], ["A", "1"]]);
    const mod = await import("@/components/audience/audience-upload-csv");
    const out = mod.parseCSV("x");
    expect(out.headers).toEqual(["name", "phone"]);
    expect(out.contacts).toEqual([{ name: "A", phone: "1" }]);
  });

  test("parseCSV handles empty records", async () => {
    mocks.parse.mockReturnValue([]);
    const mod = await import("@/components/audience/audience-upload-csv");
    const out = mod.parseCSV("x");
    expect(out.headers).toEqual([]);
    expect(out.contacts).toEqual([]);
  });

  test("parseCSV throws friendly error and logs when parser throws", async () => {
    mocks.parse.mockImplementation(() => {
      throw new Error("bad csv");
    });
    const mod = await import("@/components/audience/audience-upload-csv");
    expect(() => mod.parseCSV("x")).toThrowError("Failed to parse CSV file");
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("parseCSVAsync lowercases headers like parseCSV", async () => {
    mocks.parse.mockReset();
    mocks.parse
      .mockReturnValueOnce([[" Name ", "PHONE"]])
      .mockReturnValueOnce([{ Name: "A", PHONE: "1" }]);
    const mod = await import("@/components/audience/audience-upload-csv");
    const out = await mod.parseCSVAsync("Name,PHONE\nA,1");
    expect(out.headers).toEqual(["name", "phone"]);
    expect(out.contacts).toEqual([{ name: "A", phone: "1" }]);
  });
});


import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    parse: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("csv-parse/sync", () => ({
  parse: (...args: any[]) => mocks.parse(...args),
}));

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

describe("AudienceUploader CSV helpers", () => {
  test("parseCSVHeaders lowercases and trims", async () => {
    const mod = await import("@/components/audience/AudienceUploader");
    expect(mod.parseCSVHeaders([" Name ", "PHONE", "Other_Data"])).toEqual(["name", "phone", "other_data"]);
  });

  test("parseCSVData maps case-insensitive record keys and stringifies nullish to empty", async () => {
    const mod = await import("@/components/audience/AudienceUploader");
    const records = [{ Name: "A", PHONE: null, weird: 1 }] as any[];
    const headers = ["name", "phone", "weird"];
    expect(mod.parseCSVData(records, headers)).toEqual([{ name: "A", phone: "", weird: "1" }]);
  });

  test("parseCSVData maps missing header to empty string", async () => {
    const mod = await import("@/components/audience/AudienceUploader");
    const records = [{ Name: "A" }] as any[];
    const headers = ["name", "phone"];
    expect(mod.parseCSVData(records, headers)).toEqual([{ name: "A", phone: "" }]);
  });

  test("parseCSV returns headers + contacts", async () => {
    mocks.parse.mockReturnValue([{ Name: "A", Phone: "1" }]);
    const mod = await import("@/components/audience/AudienceUploader");
    const out = mod.parseCSV("x");
    expect(out.headers).toEqual(["name", "phone"]);
    expect(out.contacts).toEqual([{ name: "A", phone: "1" }]);
  });

  test("parseCSV handles empty records", async () => {
    mocks.parse.mockReturnValue([]);
    const mod = await import("@/components/audience/AudienceUploader");
    const out = mod.parseCSV("x");
    expect(out.headers).toEqual([]);
    expect(out.contacts).toEqual([]);
  });

  test("parseCSV throws friendly error and logs when parser throws", async () => {
    mocks.parse.mockImplementation(() => {
      throw new Error("bad csv");
    });
    const mod = await import("@/components/audience/AudienceUploader");
    expect(() => mod.parseCSV("x")).toThrowError("Failed to parse CSV file");
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});


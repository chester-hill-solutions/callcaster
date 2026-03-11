import { describe, expect, test, vi } from "vitest";

describe("parseCSV guards (mocked parser)", () => {
  test("returns empty when first row is not an array", async () => {
    vi.resetModules();
    vi.doMock("csv-parse/sync", () => {
      return { parse: () => ["not-an-array"] as any };
    });
    const mod = await import("../app/lib/csv");
    expect(mod.parseCSV("x")).toEqual({ headers: [], contacts: [] });
  });

  test("skips non-array rows defensively", async () => {
    vi.resetModules();
    vi.doMock("csv-parse/sync", () => {
      return { parse: () => [["a"], "bad-row", ["v"]] as any };
    });
    const mod = await import("../app/lib/csv");
    expect(mod.parseCSV("x")).toEqual({ headers: ["a"], contacts: [{ a: "v" }] });
  });

  test("trims and stringifies nullish headers defensively", async () => {
    vi.resetModules();
    vi.doMock("csv-parse/sync", () => {
      return { parse: () => [[null, " b "], ["x", "y"]] as any };
    });
    const mod = await import("../app/lib/csv");
    expect(mod.parseCSV("x")).toEqual({ headers: ["", "b"], contacts: [{ "": "x", b: "y" }] });
  });
});


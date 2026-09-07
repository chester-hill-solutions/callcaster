import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/logger.client", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// The wizard's preview parsers must agree with the server (#1481, #1511):
// a headerless file keeps its first row under the generated column names.
describe("audience upload client parsers on a headerless file", () => {
  test("parseCSV keeps the first row and names the columns", async () => {
    const { parseCSV } = await import("@/components/audience/audience-upload-csv");
    const result = parseCSV("Jane,6135551234 ext 202\nJohn,6135550000\n");
    expect(result.headers).toEqual(["Column 1", "Column 2"]);
    expect(result.contacts).toEqual([
      { "Column 1": "Jane", "Column 2": "6135551234 ext 202" },
      { "Column 1": "John", "Column 2": "6135550000" },
    ]);
  });

  test("parseCSVAsync matches parseCSV, and both still honour a real header row", async () => {
    const { parseCSV, parseCSVAsync } = await import("@/components/audience/audience-upload-csv");
    const headerless = "Jane,6135551234\nJohn,6135550000\n";
    expect(await parseCSVAsync(headerless)).toEqual(parseCSV(headerless));
    const withHeader = "Name,Phone\nJane,6135551234\n";
    const parsed = await parseCSVAsync(withHeader);
    expect(parsed.headers).toEqual(["name", "phone"]);
    expect(parsed.contacts).toEqual([{ name: "Jane", phone: "6135551234" }]);
  });
});

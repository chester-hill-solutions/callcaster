import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { downloadCsv } from "@/lib/csvDownload";

describe("csvDownload", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (window.URL as any).createObjectURL = vi.fn(() => "blob:1");
    (window.URL as any).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("throws for invalid inputs", () => {
    expect(() => downloadCsv("", "x.csv")).toThrow("CSV content must be a non-empty string");
    expect(() => downloadCsv("a,b", "")).toThrow("Filename must be a non-empty string");
  });

  test("creates a blob URL, clicks a link, and revokes URL", () => {
    const append = vi.spyOn(document.body, "appendChild");
    const remove = vi.spyOn(document.body, "removeChild");
    const createEl = vi.spyOn(document, "createElement");

    // Ensure click is observable.
    const link = document.createElement("a");
    const click = vi.spyOn(link, "click").mockImplementation(() => {});
    createEl.mockReturnValueOnce(link);

    downloadCsv("a,b\r\n1,2\r\n", "x.csv");

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(link);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  test("logs and wraps errors from the DOM/URL APIs", () => {
    (window.URL.createObjectURL as any).mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(() => downloadCsv("a,b", "x.csv")).toThrow("Failed to download CSV: boom");
    expect(console.error).toHaveBeenCalled();
  });

  test("wraps non-Error throws with Unknown error", () => {
    (window.URL.createObjectURL as any).mockImplementationOnce(() => {
      throw "nope";
    });

    expect(() => downloadCsv("a,b", "x.csv")).toThrow("Failed to download CSV: Unknown error");
  });
});


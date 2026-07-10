import { describe, expect, test } from "vitest";
import {
  isProcessingStale,
  PROCESSING_STALE_MS,
  PROCESSING_INTERRUPTED_MESSAGE,
} from "@/lib/processing-watchdog.server";

describe("isProcessingStale", () => {
  const now = new Date("2026-01-01T00:20:00.000Z");

  test("returns false when there is no timestamp to compare (unknown age)", () => {
    expect(isProcessingStale(null, now)).toBe(false);
    expect(isProcessingStale(undefined, now)).toBe(false);
  });

  test("returns false for an unparsable timestamp", () => {
    expect(isProcessingStale("not-a-date", now)).toBe(false);
  });

  test("returns false when last update is within the threshold", () => {
    const nineMinutesAgo = new Date(now.getTime() - 9 * 60 * 1000).toISOString();
    expect(isProcessingStale(nineMinutesAgo, now)).toBe(false);
  });

  test("returns false exactly at the threshold boundary", () => {
    const exactlyAtThreshold = new Date(now.getTime() - PROCESSING_STALE_MS).toISOString();
    expect(isProcessingStale(exactlyAtThreshold, now)).toBe(false);
  });

  test("returns true once last update exceeds the threshold", () => {
    const elevenMinutesAgo = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
    expect(isProcessingStale(elevenMinutesAgo, now)).toBe(true);
  });

  test("exposes a 10 minute threshold and a stable interruption message", () => {
    expect(PROCESSING_STALE_MS).toBe(10 * 60 * 1000);
    expect(PROCESSING_INTERRUPTED_MESSAGE).toBe(
      "Processing interrupted — please retry",
    );
  });
});

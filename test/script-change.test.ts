import { describe, expect, test } from "vitest";

import {
  normalizeScriptForComparison,
  normalizeScriptPageDataForComparison,
} from "@/lib/script-change";

describe("script-change helpers", () => {
  test("returns nullish script values unchanged", () => {
    expect(normalizeScriptForComparison(null)).toBeNull();
    expect(normalizeScriptForComparison(undefined)).toBeUndefined();
  });

  test("normalizes script updated_at for comparisons", () => {
    const script = {
      id: 1,
      name: "Primary",
      updated_at: "2025-01-01T00:00:00.000Z",
    } as any;

    expect(normalizeScriptForComparison(script)).toEqual({
      ...script,
      updated_at: null,
    });
  });

  test("returns page data unchanged when campaign script is missing", () => {
    const pageData = {
      campaignDetails: {
        script: null,
      },
    };

    expect(normalizeScriptPageDataForComparison(pageData)).toBe(pageData);
    expect(normalizeScriptPageDataForComparison({})).toEqual({});
  });

  test("normalizes nested campaign script updated_at", () => {
    const pageData = {
      campaignDetails: {
        script: {
          id: 10,
          title: "Script A",
          updated_at: "2026-01-02T03:04:05.000Z",
        },
        other: "kept",
      },
      untouched: true,
    } as any;

    expect(normalizeScriptPageDataForComparison(pageData)).toEqual({
      campaignDetails: {
        script: {
          id: 10,
          title: "Script A",
          updated_at: null,
        },
        other: "kept",
      },
      untouched: true,
    });
  });
});

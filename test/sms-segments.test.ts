import { describe, expect, test } from "vitest";

import { getSmsSegmentInfo } from "../app/lib/sms-segments";

describe("app/lib/sms-segments.ts", () => {
  test("uses GSM-7 single and multi-segment limits", () => {
    expect(getSmsSegmentInfo("a".repeat(160))).toMatchObject({
      encoding: "GSM-7",
      totalCharacters: 160,
      totalUnits: 160,
      segmentCount: 1,
      unitsPerSegment: 160,
      unitsUsedInCurrentSegment: 160,
      unitsRemainingInCurrentSegment: 0,
    });

    expect(getSmsSegmentInfo("a".repeat(161))).toMatchObject({
      encoding: "GSM-7",
      totalCharacters: 161,
      totalUnits: 161,
      segmentCount: 2,
      unitsPerSegment: 153,
      unitsUsedInCurrentSegment: 8,
      unitsRemainingInCurrentSegment: 145,
    });
  });

  test("counts GSM-7 extension characters as two units", () => {
    expect(getSmsSegmentInfo("^".repeat(80))).toMatchObject({
      encoding: "GSM-7",
      totalCharacters: 80,
      totalUnits: 160,
      segmentCount: 1,
    });

    expect(getSmsSegmentInfo("^".repeat(81))).toMatchObject({
      encoding: "GSM-7",
      totalCharacters: 81,
      totalUnits: 162,
      segmentCount: 2,
      unitsPerSegment: 153,
      unitsUsedInCurrentSegment: 9,
    });
  });

  test("falls back to UCS-2 when unicode characters are present", () => {
    expect(getSmsSegmentInfo("🔥".repeat(70))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 70,
      totalUnits: 70,
      segmentCount: 1,
      unitsPerSegment: 70,
    });

    expect(getSmsSegmentInfo("🔥".repeat(71))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 71,
      totalUnits: 71,
      segmentCount: 2,
      unitsPerSegment: 67,
      unitsUsedInCurrentSegment: 4,
      unitsRemainingInCurrentSegment: 63,
    });
  });

  test("returns an empty-state counter for blank messages", () => {
    expect(getSmsSegmentInfo("")).toEqual({
      encoding: "GSM-7",
      totalCharacters: 0,
      totalUnits: 0,
      segmentCount: 0,
      unitsPerSegment: 160,
      unitsUsedInCurrentSegment: 0,
      unitsRemainingInCurrentSegment: 160,
    });
  });
});

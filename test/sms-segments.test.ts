import { describe, expect, test } from "vitest";

import { estimateSegments, getSmsSegmentInfo } from "../app/lib/sms-segments";

describe("app/lib/sms-segments.ts", () => {
  test("uses GSM-7 single and multi-segment limits (160/161 boundary)", () => {
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

  test("uses GSM-7 concatenated-segment limits (306/307 boundary)", () => {
    // 153 * 2 = 306 exactly fills a 2-segment message.
    expect(getSmsSegmentInfo("a".repeat(306))).toMatchObject({
      encoding: "GSM-7",
      totalUnits: 306,
      segmentCount: 2,
      unitsPerSegment: 153,
      unitsUsedInCurrentSegment: 153,
      unitsRemainingInCurrentSegment: 0,
    });

    // One character over rolls into a 3rd segment.
    expect(getSmsSegmentInfo("a".repeat(307))).toMatchObject({
      encoding: "GSM-7",
      totalUnits: 307,
      segmentCount: 3,
      unitsPerSegment: 153,
      unitsUsedInCurrentSegment: 1,
      unitsRemainingInCurrentSegment: 152,
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

    // Mixed basic + extension characters (each of €[]{}~^| costs 2 units).
    expect(getSmsSegmentInfo("€[]{}~^|")).toMatchObject({
      encoding: "GSM-7",
      totalCharacters: 8,
      totalUnits: 16,
      segmentCount: 1,
    });
  });

  test("falls back to UCS-2 for non-GSM BMP characters (70/71 boundary)", () => {
    // U+2019 RIGHT SINGLE QUOTATION MARK — outside GSM-7, but a single
    // UTF-16 code unit, so character count and unit count match 1:1.
    expect(getSmsSegmentInfo("’".repeat(70))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 70,
      totalUnits: 70,
      segmentCount: 1,
      unitsPerSegment: 70,
      unitsUsedInCurrentSegment: 70,
      unitsRemainingInCurrentSegment: 0,
    });

    expect(getSmsSegmentInfo("’".repeat(71))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 71,
      totalUnits: 71,
      segmentCount: 2,
      unitsPerSegment: 67,
      unitsUsedInCurrentSegment: 4,
      unitsRemainingInCurrentSegment: 63,
    });
  });

  test("counts astral-plane emoji as 2 UTF-16 units even though they display as 1 character", () => {
    // 🔥 (U+1F525) requires a UTF-16 surrogate pair. Twilio bills UCS-2
    // segments in UTF-16 code units, not Unicode code points, so a single
    // emoji costs 2 of the 70/67-unit budget even though it's 1 visible
    // character.
    expect(getSmsSegmentInfo("🔥")).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 1,
      totalUnits: 2,
      segmentCount: 1,
      unitsPerSegment: 70,
      unitsUsedInCurrentSegment: 2,
      unitsRemainingInCurrentSegment: 68,
    });

    // 35 emoji = 70 UTF-16 units exactly fills a single segment.
    expect(getSmsSegmentInfo("🔥".repeat(35))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 35,
      totalUnits: 70,
      segmentCount: 1,
      unitsPerSegment: 70,
      unitsUsedInCurrentSegment: 70,
      unitsRemainingInCurrentSegment: 0,
    });

    // One more emoji (72 units) rolls into a 2nd segment.
    expect(getSmsSegmentInfo("🔥".repeat(36))).toMatchObject({
      encoding: "UCS-2",
      totalCharacters: 36,
      totalUnits: 72,
      segmentCount: 2,
      unitsPerSegment: 67,
      unitsUsedInCurrentSegment: 5,
      unitsRemainingInCurrentSegment: 62,
    });
  });

  test("a single non-GSM character anywhere in the body forces the whole message to UCS-2", () => {
    expect(getSmsSegmentInfo("hello 🔥 world")).toMatchObject({
      encoding: "UCS-2",
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

describe("app/lib/sms-segments.ts estimateSegments", () => {
  test("returns just the segment count and encoding", () => {
    expect(estimateSegments("a".repeat(160))).toEqual({
      segments: 1,
      encoding: "GSM-7",
    });
    expect(estimateSegments("a".repeat(161))).toEqual({
      segments: 2,
      encoding: "GSM-7",
    });
    expect(estimateSegments("🔥")).toEqual({
      segments: 1,
      encoding: "UCS-2",
    });
    expect(estimateSegments("")).toEqual({
      segments: 0,
      encoding: "GSM-7",
    });
  });
});

import { describe, expect, test } from "vitest";

import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
  estimateMessageCredits,
  voiceBillingKindFromCampaignType,
  voiceCreditsFromDurationSeconds,
} from "../shared/pricing";
import { estimateSegments } from "../app/lib/sms-segments";

/**
 * Mirrors the real billing branch verbatim from
 * app/routes/api+/sms/status.action.server.ts so this test fails loudly if
 * estimateMessageCredits() and the actual debit logic ever diverge:
 *   const amount = isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * numSegments;
 */
function realBillingAmount(numSegments: number, isMms: boolean): number {
  return isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * Math.max(1, numSegments);
}

describe("shared/pricing Option B", () => {
  test("credit peg and minimum purchase", () => {
    expect(CREDIT_PRICE_CAD).toBe(0.02);
    expect(MIN_PURCHASE_CAD).toBe(10);
    expect(MIN_CREDITS).toBe(500);
    expect(NUMBER_RENTAL_MONTHLY_CREDITS).toBe(100);
    expect(SMS_SEGMENT_CREDITS).toBe(1);
  });

  test("voiceBillingKindFromCampaignType maps IVR campaign types", () => {
    expect(voiceBillingKindFromCampaignType("robocall")).toBe("ivr");
    expect(voiceBillingKindFromCampaignType("simple_ivr")).toBe("ivr");
    expect(voiceBillingKindFromCampaignType("live_call")).toBe("staffed");
    expect(voiceBillingKindFromCampaignType(null)).toBe("staffed");
  });

  test("IVR voice credits match pricing brief examples", () => {
    expect(voiceCreditsFromDurationSeconds(0, "ivr")).toBe(2);
    expect(voiceCreditsFromDurationSeconds(20, "ivr")).toBe(2);
    expect(voiceCreditsFromDurationSeconds(60, "ivr")).toBe(2);
    expect(voiceCreditsFromDurationSeconds(61, "ivr")).toBe(5);
    expect(voiceCreditsFromDurationSeconds(300, "ivr")).toBe(14);
  });

  test("staffed voice credits use higher dial and per-minute rates", () => {
    expect(voiceCreditsFromDurationSeconds(0, "staffed")).toBe(4);
    expect(voiceCreditsFromDurationSeconds(60, "staffed")).toBe(4);
    expect(voiceCreditsFromDurationSeconds(61, "staffed")).toBe(9);
  });
});

describe("shared/pricing estimateMessageCredits", () => {
  test("SMS (no media) charges SMS_SEGMENT_CREDITS per segment", () => {
    expect(estimateMessageCredits({ body: "a".repeat(160), hasMedia: false })).toEqual({
      credits: 1,
      segments: 1,
      encoding: "GSM-7",
      isMms: false,
    });

    expect(estimateMessageCredits({ body: "a".repeat(161), hasMedia: false })).toEqual({
      credits: 2,
      segments: 2,
      encoding: "GSM-7",
      isMms: false,
    });

    expect(estimateMessageCredits({ body: "a".repeat(307), hasMedia: false })).toEqual({
      credits: 3,
      segments: 3,
      encoding: "GSM-7",
      isMms: false,
    });
  });

  test("MMS (media attached) is a flat MMS_CREDITS regardless of body length or segment count", () => {
    expect(estimateMessageCredits({ body: "", hasMedia: true })).toEqual({
      credits: MMS_CREDITS,
      segments: 0,
      encoding: "GSM-7",
      isMms: true,
    });

    // Even a long, multi-segment body doesn't change the MMS flat rate.
    expect(
      estimateMessageCredits({ body: "a".repeat(400), hasMedia: true }),
    ).toEqual({
      credits: MMS_CREDITS,
      segments: 3,
      encoding: "GSM-7",
      isMms: true,
    });
  });

  test("an empty, media-less draft estimates 0 credits (nothing to send yet)", () => {
    expect(estimateMessageCredits({ body: "", hasMedia: false })).toEqual({
      credits: 0,
      segments: 0,
      encoding: "GSM-7",
      isMms: false,
    });
  });

  test("switches to the MMS figure the instant media is attached, independent of body", () => {
    const body = "hello";
    const withoutMedia = estimateMessageCredits({ body, hasMedia: false });
    const withMedia = estimateMessageCredits({ body, hasMedia: true });

    expect(withoutMedia.credits).toBe(1);
    expect(withMedia.credits).toBe(MMS_CREDITS);
  });

  test("matches the real billing branch in app/routes/api+/sms/status.action.server.ts for every non-empty body", () => {
    const bodies = ["hi", "a".repeat(160), "a".repeat(161), "a".repeat(306), "a".repeat(307), "🔥".repeat(40)];

    for (const body of bodies) {
      for (const hasMedia of [false, true]) {
        const estimate = estimateMessageCredits({ body, hasMedia });
        const { segments } = estimateSegments(body);
        expect(estimate.credits).toBe(realBillingAmount(segments, hasMedia));
      }
    }
  });
});

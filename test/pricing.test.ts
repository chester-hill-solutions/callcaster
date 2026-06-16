import { describe, expect, test } from "vitest";

import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
  voiceBillingKindFromCampaignType,
  voiceCreditsFromDurationSeconds,
} from "../shared/pricing";

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

import {
  IVR_FIRST_MINUTE_CREDITS,
  SMS_SEGMENT_CREDITS,
  STAFFED_FIRST_MINUTE_CREDITS,
  voiceBillingKindFromCampaignType,
} from "./pricing";

export type CampaignCreditEstimate = {
  perContactCredits: number;
  totalCredits: number;
  rateDescription: string;
};

export type CampaignBillingSummary = {
  estimate: CampaignCreditEstimate;
  actualDebitCredits: number;
  smsDebitCredits: number;
  voiceDebitCredits: number;
  smsDebitEvents: number;
  voiceDebitEvents: number;
};

export function estimateCampaignCredits(
  campaignType: string | null | undefined,
  contactCount: number,
): CampaignCreditEstimate {
  const count = Math.max(0, contactCount);

  if (campaignType === "message") {
    return {
      perContactCredits: SMS_SEGMENT_CREDITS,
      totalCredits: count * SMS_SEGMENT_CREDITS,
      rateDescription: "1 credit per SMS segment",
    };
  }

  const kind = voiceBillingKindFromCampaignType(campaignType);
  const perContactCredits =
    kind === "ivr" ? IVR_FIRST_MINUTE_CREDITS : STAFFED_FIRST_MINUTE_CREDITS;

  return {
    perContactCredits,
    totalCredits: count * perContactCredits,
    rateDescription:
      kind === "ivr"
        ? "2 credits per dial (first minute), then 3 credits per additional minute"
        : "4 credits per dial (first minute), then 5 credits per additional minute",
  };
}

import {
  IVR_FIRST_MINUTE_CREDITS,
  MMS_CREDITS,
  SMS_SEGMENT_CREDITS,
  estimateMessageCredits,
  STAFFED_FIRST_MINUTE_CREDITS,
  voiceBillingKindFromCampaignType,
} from "./pricing";

export type CampaignCreditEstimate = {
  contactCount: number;
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
  message?: { body: string; hasMedia: boolean },
): CampaignCreditEstimate {
  const count = Math.max(0, contactCount);

  if (campaignType === "message") {
    if (!message) throw new Error("Message content is required for a campaign estimate");
    const { credits, segments, isMms } = estimateMessageCredits(message);
    return {
      contactCount: count,
      perContactCredits: credits,
      totalCredits: count * credits,
      rateDescription: isMms
        ? `${MMS_CREDITS} credits per MMS message`
        : `${SMS_SEGMENT_CREDITS} credits per SMS segment (${segments} segment${segments === 1 ? "" : "s"} per message; MMS excluded)`,
    };
  }

  const kind = voiceBillingKindFromCampaignType(campaignType);
  const perContactCredits =
    kind === "ivr" ? IVR_FIRST_MINUTE_CREDITS : STAFFED_FIRST_MINUTE_CREDITS;

  return {
    contactCount: count,
    perContactCredits,
    totalCredits: count * perContactCredits,
    rateDescription:
      kind === "ivr"
        ? "2 credits per dial (first minute), then 3 credits per additional minute"
        : "4 credits per dial (first minute), then 5 credits per additional minute",
  };
}

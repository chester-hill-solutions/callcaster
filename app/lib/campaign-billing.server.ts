import {
  estimateCampaignCredits,
  type CampaignBillingSummary,
} from "../../shared/campaign-billing";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { TERMINAL_BILLABLE_SMS_STATUSES } from "@/lib/pricing";
import { smsKey, callKey, bucketFromIdempotencyKey } from "@/lib/billing-keys";

export type { CampaignBillingSummary };

const TERMINAL_SMS_STATUSES = TERMINAL_BILLABLE_SMS_STATUSES;

export async function loadCampaignBillingSummary(args: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  campaignId: number;
  campaignType: string | null | undefined;
  queuedCount: number;
}): Promise<CampaignBillingSummary> {
  const estimate = estimateCampaignCredits(args.campaignType, args.queuedCount);

  const [messagesResult, callsResult] = await Promise.all([
    args.supabaseClient
      .from("message")
      .select("sid")
      .eq("campaign_id", args.campaignId)
      .eq("workspace", args.workspaceId)
      .neq("direction", "inbound")
      .in("status", [...TERMINAL_SMS_STATUSES]),
    args.supabaseClient
      .from("call")
      .select("sid")
      .eq("campaign_id", args.campaignId)
      .eq("workspace", args.workspaceId),
  ]);

  // Voice idempotency keys are namespaced by billing kind (call:${sid}:${kind});
  // include both variants so the ledger lookup catches the debit regardless of kind.
  const idempotencyKeys = [
    ...(messagesResult.data ?? []).map((row) => smsKey(row.sid)),
    ...(callsResult.data ?? []).flatMap((row) => [
      callKey(row.sid, "ivr"),
      callKey(row.sid, "staffed"),
    ]),
  ];

  let smsDebitCredits = 0;
  let voiceDebitCredits = 0;
  let smsDebitEvents = 0;
  let voiceDebitEvents = 0;

  if (idempotencyKeys.length > 0) {
    const { data: debits, error } = await args.supabaseClient
      .from("transaction_history")
      .select("amount, idempotency_key")
      .eq("workspace", args.workspaceId)
      .eq("type", "DEBIT")
      .in("idempotency_key", idempotencyKeys);

    if (error) {
      throw error;
    }

    for (const row of debits ?? []) {
      const credits = Math.abs(row.amount);
      const bucket = bucketFromIdempotencyKey(row.idempotency_key);
      if (bucket === "sms") {
        smsDebitCredits += credits;
        smsDebitEvents += 1;
      } else if (bucket === "voice") {
        voiceDebitCredits += credits;
        voiceDebitEvents += 1;
      }
    }
  }

  return {
    estimate,
    actualDebitCredits: smsDebitCredits + voiceDebitCredits,
    smsDebitCredits,
    voiceDebitCredits,
    smsDebitEvents,
    voiceDebitEvents,
  };
}

import {
  estimateCampaignCredits,
  type CampaignBillingSummary,
} from "../../shared/campaign-billing";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  call as callTable,
  message as messageTable,
  transaction_history as transactionHistoryTable,
} from "@/db/schema";
import { TERMINAL_BILLABLE_SMS_STATUSES } from "@/lib/pricing";
import { smsKey, callKey, bucketFromIdempotencyKey } from "@/lib/billing-keys";
import { createTenantDb } from "@/server/tenant-db";

export type { CampaignBillingSummary };

const TERMINAL_SMS_STATUSES = TERMINAL_BILLABLE_SMS_STATUSES;

export async function loadCampaignBillingSummary(args: {
  workspaceId: string;
  campaignId: number;
  campaignType: string | null | undefined;
  queuedCount: number;
}): Promise<CampaignBillingSummary> {
  const estimate = estimateCampaignCredits(args.campaignType, args.queuedCount);
  const tdb = createTenantDb(args.workspaceId);

  const [messageRows, callRows] = await Promise.all([
    tdb.message.findMany({
      where: and(
        eq(messageTable.campaign_id, args.campaignId),
        ne(messageTable.direction, "inbound"),
        inArray(messageTable.status, [...TERMINAL_SMS_STATUSES]),
      ),
      columns: { sid: true },
    }),
    tdb.call.findMany({
      where: eq(callTable.campaign_id, args.campaignId),
      columns: { sid: true },
    }),
  ]);

  const idempotencyKeys = [
    ...messageRows.map((row) => smsKey(row.sid)),
    ...callRows.flatMap((row) => [callKey(row.sid, "ivr"), callKey(row.sid, "staffed")]),
  ];

  let smsDebitCredits = 0;
  let voiceDebitCredits = 0;
  let smsDebitEvents = 0;
  let voiceDebitEvents = 0;

  if (idempotencyKeys.length > 0) {
    const debits = await tdb.transaction_history.findMany({
      where: and(
        eq(transactionHistoryTable.type, "DEBIT"),
        inArray(transactionHistoryTable.idempotency_key, idempotencyKeys),
      ),
      columns: { amount: true, idempotency_key: true },
    });

    for (const row of debits) {
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

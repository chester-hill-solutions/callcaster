import { Campaign, OutreachAttempt } from "@/lib/types";
import { cancelQueuedMessagesForCampaign } from "@/lib/database/call-actions.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { shouldUpdateOutreachDisposition } from "@/lib/outreach-disposition";
import { markContactLineType } from "@/lib/twilio-lookup.server";
import { alertSmsGeoPermissionBlocked } from "@/lib/twilio-geo-permissions.server";
import {
  isTerminalSmsStatus,
  normalizeSmsStatus,
  pickRawTwilioSmsStatus,
  smsStatusToOutreachDisposition,
} from "@/lib/sms-status";
import { sendWorkspaceWebhookNotification } from "@/lib/workspace-webhooks.server";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS, debitAmountFromCredits } from "@/lib/pricing";
import { smsKey } from "@/lib/billing-keys";
import type { TwilioSmsStatusWebhook, OutreachDisposition } from "@/lib/twilio.types";
import { campaign as campaignTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findMessageBySid } from "@/lib/message-db.server";
import {
  findCallBySid,
  findOutreachAttemptById,
  findOutreachAttemptWithCampaignType,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import {
  billTerminalCallStatus,
  resolveCallOutreachContext,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";

export async function runCallStatusSideEffects(args: {
  callSid: string;
  twilioParams: Record<string, string>;
}): Promise<{ ok: true }> {
  const callRow = await findCallBySid(args.callSid);
  if (!callRow) {
    throw new Error(`Call ${args.callSid} not found for side effects`);
  }

  await billTerminalCallStatus(callRow);

  const underCaseData = twilioParamsToUnderCase(args.twilioParams);
  const { outreachAttemptId, workspaceId } = await resolveCallOutreachContext(callRow);

  const currentAttempt =
    outreachAttemptId != null && workspaceId
      ? await findOutreachAttemptWithCampaignType(workspaceId, outreachAttemptId)
      : null;

  const billingWorkspace = currentAttempt?.workspace ?? workspaceId;
  if (currentAttempt && billingWorkspace) {
    await emitPredictiveBroadcast(billingWorkspace, {
      contact_id: currentAttempt.contact_id,
      status: String(underCaseData.call_status ?? ""),
    });
  }

  return { ok: true };
}

export async function runSmsStatusSideEffects(args: {
  messageSid: string;
  twilioParams: Partial<TwilioSmsStatusWebhook>;
}): Promise<{ ok: true }> {
  const sid = args.messageSid;
  const rawStatus = pickRawTwilioSmsStatus(args.twilioParams);
  const messageData = await findMessageBySid(sid);

  if (!messageData?.workspace) {
    throw new Error(`Message ${sid} not found for side effects`);
  }

  const messageStatus =
    normalizeSmsStatus(rawStatus ?? messageData.status) ?? "failed";

  const errorCode =
    typeof args.twilioParams.ErrorCode === "string" &&
    args.twilioParams.ErrorCode.trim()
      ? Number.parseInt(args.twilioParams.ErrorCode, 10)
      : messageData.error_code;

  if (errorCode === 30006 && messageData.contact_id) {
    await markContactLineType({
      workspaceId: messageData.workspace,
      contactId: messageData.contact_id,
      lineType: "landline",
    });
  }

  // 21408 = destination region not enabled for messaging on this subaccount.
  // SMS geo-permissions have no public API, so the toggle is Console-only —
  // raise a (rate-limited) ops alert naming the fix instead of letting sends
  // fail one by one.
  if (errorCode === 21408) {
    await alertSmsGeoPermissionBlocked({
      workspaceId: messageData.workspace,
      messageSid: sid,
      to: messageData.to,
    });
  }

  if (messageData.workspace && isTerminalSmsStatus(messageStatus)) {
    const numSegments = Math.max(
      1,
      Number.parseInt(String(messageData.num_segments ?? "1"), 10) || 1,
    );
    const numMedia = Number.parseInt(String(messageData.num_media ?? "0"), 10) || 0;
    const isMms = numMedia > 0;
    const amount = isMms ? MMS_CREDITS : SMS_SEGMENT_CREDITS * numSegments;
    const note = isMms
      ? `MMS ${sid} ${messageStatus}`
      : `SMS ${sid} ${messageStatus} (${numSegments} segment${numSegments === 1 ? "" : "s"})`;
    await insertTransactionHistoryIdempotent({
      workspaceId: messageData.workspace,
      type: "DEBIT",
      amount: debitAmountFromCredits(amount),
      note,
      idempotencyKey: smsKey(sid),
      messageSid: sid,
    });
  }

  let outreachData:
    | (OutreachAttempt & { campaign: Partial<Campaign> })
    | null = null;

  if (messageData.outreach_attempt_id && messageData.workspace) {
    const disposition: OutreachDisposition =
      smsStatusToOutreachDisposition(messageStatus);

    const currentAttempt = await findOutreachAttemptById(
      messageData.workspace,
      messageData.outreach_attempt_id,
    );
    const shouldSkip = !shouldUpdateOutreachDisposition({
      currentDisposition: currentAttempt?.disposition ?? null,
      nextDisposition: disposition,
    });

    if (!shouldSkip) {
      const outreachResult = await updateOutreachAttemptForWorkspace(
        messageData.workspace,
        messageData.outreach_attempt_id,
        { disposition },
      );

      if (!(outreachResult instanceof Response)) {
        const tdb = createTenantDb(messageData.workspace);
        const campaign = outreachResult.campaign_id
          ? await tdb.campaign.findFirst({
              where: eq(campaignTable.id, outreachResult.campaign_id),
              columns: { end_date: true },
            })
          : null;
        outreachData = {
          ...outreachResult,
          campaign: { end_date: campaign?.end_date ?? null },
        } as OutreachAttempt & { campaign: Partial<Campaign> };
      } else {
        logger.error("Error updating outreach attempt:", outreachResult.statusText);
      }
    }
  }

  if (outreachData && outreachData.campaign?.end_date) {
    const now = new Date();
    if (
      now > new Date(outreachData.campaign.end_date) &&
      typeof messageData.campaign_id === "number" &&
      messageData.workspace
    ) {
      const twilio = await createWorkspaceTwilioInstance({
        workspace_id: messageData.workspace,
      });
      await cancelQueuedMessagesForCampaign(twilio, messageData.campaign_id);
    }
  }

  const webhookResult = await sendWorkspaceWebhookNotification({
    workspaceId: messageData.workspace,
    eventCategory: "outbound_sms",
    eventType: "UPDATE",
    payload: {
      type: "outbound_sms",
      record: {
        message_sid: messageData.sid,
        from: messageData.from,
        to: messageData.to,
        body: messageData.body,
        num_media: messageData.num_media,
        status: messageData.status,
        date_updated: messageData.date_updated,
      },
      old_record: { message_sid: messageData.sid },
    },
  });
  if (!webhookResult.success) {
    logger.error("SMS status webhook delivery failed", webhookResult.error);
  }

  return { ok: true };
}

export async function runRecordingSideEffects(args: {
  callSid: string;
  twilioParams: Record<string, string>;
}): Promise<{ ok: true }> {
  const callRow = await findCallBySid(args.callSid);
  if (!callRow?.workspace) {
    throw new Error(`Call ${args.callSid} not found for recording side effects`);
  }

  const recordingSid = args.twilioParams.RecordingSid?.trim();
  const recordingDuration = args.twilioParams.RecordingDuration?.trim();

  const enrichment: Record<string, string> = {};
  if (recordingSid) {
    enrichment.recording_sid = recordingSid;
  }
  if (recordingDuration) {
    enrichment.recording_duration = recordingDuration;
  }

  if (Object.keys(enrichment).length > 0) {
    await updateCallBySid(callRow.workspace, args.callSid, enrichment);
  }

  logger.debug("Recording side effects completed", {
    callSid: args.callSid,
    workspaceId: callRow.workspace,
  });

  return { ok: true };
}

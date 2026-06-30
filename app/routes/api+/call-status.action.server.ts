import {
  billingUnitsFromCallDurationSeconds,
  buildCallUpsertFromTwilioParams,
  resolveCallOutreachContext,
  TERMINAL_CALL_STATUSES,
  twilioParamsToUnderCase,
  voiceBillingKindFromCampaignType,
} from "@/lib/twilio-call-status.server";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { data as routeData } from "react-router";
import { getServiceSupabase } from "@/lib/supabase.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { callKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import {
  findOutreachAttemptWithCampaignType,
  updateOutreachAttemptForWorkspace,
  upsertCallBySid,
} from "@/lib/telephony-db.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const callSidRaw = params.CallSid ?? params.call_sid;
  if (!callSidRaw) {
    return routeData({ error: "Missing CallSid" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const validation = await validateTwilioWebhookForCallSid({
    request,
    supabase,
    callSid: callSidRaw,
    params,
  });
  if (!validation.ok) {
    return validation.response;
  }

  const calledVia = params.CalledVia ?? params.called_via;
  const userId = calledVia ? calledVia.split(":")[1] : "";
  const realtime = supabase.realtime.channel(userId || "default");
  const underCaseData = twilioParamsToUnderCase(params);
  const updateData = buildCallUpsertFromTwilioParams(params);

  const callRow = await upsertCallBySid(updateData);
  if (!callRow) {
    logger.error("Error updating call:", { sid: updateData.sid });
    return routeData({ success: false, error: "Failed to update call" }, { status: 500 });
  }

  const { outreachAttemptId, workspaceId } = await resolveCallOutreachContext(
    supabase,
    callRow,
  );

  const currentAttempt =
    outreachAttemptId != null && workspaceId
      ? await findOutreachAttemptWithCampaignType(workspaceId, outreachAttemptId)
      : null;

  const billingWorkspace = currentAttempt?.workspace ?? workspaceId;
  if (currentAttempt) {
    realtime.send({
      type: "broadcast",
      event: "message",
      payload: {
        contact_id: currentAttempt.contact_id,
        status: underCaseData.call_status,
      },
    });
  }

  const nextDisposition = String(underCaseData.call_status || "").toLowerCase();
  if (outreachAttemptId != null && workspaceId && nextDisposition) {
    const currentDisposition = currentAttempt?.disposition ?? null;
    if (canTransitionOutreachDisposition(currentDisposition, nextDisposition)) {
      const result = await updateOutreachAttemptForWorkspace(
        workspaceId,
        outreachAttemptId,
        { disposition: nextDisposition },
      );

      if (result instanceof Response) {
        logger.error("Error updating attempt:", result.statusText);
        return routeData({ success: false, error: "Failed to update attempt" }, { status: 500 });
      }
    } else {
      logger.debug("Skipping outreach disposition transition", {
        currentDisposition,
        nextDisposition,
      });
    }
  }

  const statusStr = String(underCaseData.call_status ?? "");
  if (
    TERMINAL_CALL_STATUSES.includes(
      statusStr as (typeof TERMINAL_CALL_STATUSES)[number],
    )
  ) {
    if (billingWorkspace) {
      const duration = Math.max(
        Number(underCaseData.duration) || 0,
        Number(underCaseData.call_duration) || 0,
      );
      const campaignType = currentAttempt?.campaign?.type ?? null;
      const billingKind = voiceBillingKindFromCampaignType(campaignType);
      const billingUnits = billingUnitsFromCallDurationSeconds(duration, billingKind);
      const note = currentAttempt
        ? `Call ${updateData.sid}, Contact ${currentAttempt.contact_id}, Outreach Attempt ${outreachAttemptId}`
        : `Call ${updateData.sid} (API/staffed dial)`;
      await insertTransactionHistoryIdempotent({
        workspaceId: billingWorkspace,
        type: "DEBIT",
        amount: debitAmountFromCredits(billingUnits),
        note,
        idempotencyKey: callKey(updateData.sid, billingKind),
        callSid: updateData.sid,
        campaignId: callRow.campaign_id ?? null,
      });
    }
  }

  return routeData({ success: true });
};

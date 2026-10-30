import { handleConferenceParticipantHangup } from "@/lib/conference-participant-hangup.server";
import { recordPredictiveSuccessorCallback } from "@/server/predictive-successor-callback.server";
import { getPredictiveMachineOperation } from "@/server/predictive-machine-operation.server";
import { needsPredictiveTerminalContinuation } from "@/lib/predictive-terminal-status";
import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
} from "@/lib/twilio-call-status.server";
import {
  isParticipantHangup,
  isParticipantJoin,
  parseTwilioVoiceCallback,
  userIdFromConferenceName,
  type TwilioVoiceCallback,
} from "@/lib/twilio/voice-callback";
import { handlePredictiveParticipantJoin } from "@/lib/predictive-participant-join.server";
import {
  dequeueQueueEntry
} from "@/lib/campaign-queue-db.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { data as routeData } from "react-router";
import { runAutoDialerTurn, sendFundedPredictiveRecipient, stopRefusedPredictiveSetup } from "@/lib/auto-dial.server";
import { logger } from "@/lib/logger.server";
import { OutreachAttempt } from "@/lib/types";
import { Tables } from "@/lib/db-types";
import type Twilio from "twilio";
import {
  claimTerminalCallStatus,
  findCallBySid,
  findCampaignTypeByCampaignId,
  findOutreachAttemptById,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { requireTwilioSignature, resolveCanonicalTwilioWebhookUrl, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { defineAction } from "@/lib/handler.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import { predictiveCustomerBroadcast } from "@/lib/predictive-customer-broadcast.server";
import { bindVerifiedVoiceReservationRequest } from "@/lib/voice-reservation-webhook.server";
import { enqueueCallStatusSideEffects } from "@/lib/worker/enqueue-call-status.server";
import { runCallStatusSideEffects } from "@/lib/worker/webhook-side-effects.server";
import { hasVoiceReservationCallBinding } from "@/server/voice-bridge-reservation.server";
import { bindVerifiedFundedCallStatus } from "@/lib/voice-bridge-webhook.server";
import { bindPredictiveConferenceEvent, claimFirstPredictiveRecipient } from "@/server/predictive-conference-reservation.server";
import { createOriginalVoiceAccountClient } from "@/lib/voice-original-account.server";
import { handleBoundVoiceAudioParticipant } from "@/lib/voice-audio-participant.server";
import { isRetiredVoiceAudioSource } from "@/server/voice-audio-classification.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";

type TwilioClient = Twilio.Twilio;

const requireValue = (
  value: string | null | undefined,
  fieldName: string,
): string => {
  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return value;
};

export const updateOutreachAttempt = async (
  id: string,
  workspaceId: string,
  update: Partial<OutreachAttempt>,
) => {
  return updateOutreachAttemptForWorkspace(workspaceId, id, update);
};

/**
 * The user id stored inside a `call.conference_id`, which is a conference NAME
 * (`${userId}~${uuid}`), not a SID. Webhook payloads get this parsed for them
 * as `conferenceUserId`; this wrapper is for the DB-derived value.
 *
 * The `?? conferenceId` fallback is deliberate legacy tolerance: a stored
 * conference id with no `~` predates the `${userId}~${uuid}` naming and was
 * always passed through whole.
 */
function resolveUserIdFromConferenceName(conferenceId: string | null): string {
  if (!conferenceId) return "";
  return userIdFromConferenceName(conferenceId) ?? conferenceId;
}

const triggerAutoDialer = async (callData: Tables<"call">) => {
  try {
    const userId = resolveUserIdFromConferenceName(callData.conference_id);
    // Call the dialer turn in-process rather than self-fetching
    // `/api/auto-dial/dialer`: that path is matched by the Twilio webhook
    // prefix `/api/auto-dial`, so an unsigned self-fetch would be rejected
    // with 403 by requireTwilioSignature (always enforced in production).
    const result = await runAutoDialerTurn({
      user_id: userId,
      campaign_id: callData.campaign_id ?? 0,
      workspace_id: callData.workspace ?? "",
      conference_id: callData.conference_id,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
  } catch (error) {
    logger.error("Error triggering auto dialer:", error);
    throw error;
  }
};

const handleCallStatus = async (
  event: TwilioVoiceCallback,
  dbCall: Tables<"call">,
  twilio: TwilioClient,
  status: Tables<"call">["status"],
) => {
  try {
    const updateData = buildCallUpsertFromTwilioParams(event.raw);
    if (status) {
      updateData.status = status;
    }

    const workspace = requireValue(dbCall.workspace, "workspace");
    const campaignType = dbCall.campaign_id
      ? await findCampaignTypeByCampaignId(dbCall.campaign_id, workspace)
      : null;

    const { call: callUpdate } = await processCallStatusWebhook(updateData, {
      campaignType,
      workspaceId: workspace,
      campaignId: dbCall.campaign_id ?? null,
      contactId: dbCall.contact_id ?? null,
      outreachAttemptId: dbCall.outreach_attempt_id ?? null,
    });

    if (!callUpdate.outreach_attempt_id) {
      throw new Error(
        "Missing outreach_attempt_id for auto-dial status update",
      );
    }
    const outreachStatus = await findOutreachAttemptById(
      workspace,
      callUpdate.outreach_attempt_id,
    );
    if (!outreachStatus) {
      return;
    }

    await dequeueQueueEntry({
      by: {
        contactId: outreachStatus.contact_id,
        campaignId: outreachStatus.campaign_id,
      },
      workspaceId: workspace,
      household: true,
      // A conference name is `${userId}~${uuid}`, and this argument is bound
      // as ::uuid — passing the raw name raised 22P02 on every terminal call,
      // so the contact was never dequeued and the dialer stopped after one.
      userId: resolveUserIdFromConferenceName(callUpdate.conference_id) || null,
      reason: `Call ${status?.toLowerCase()}`,
    });
    const conferences = await twilio.conferences.list({
      friendlyName: callUpdate.conference_id ?? "",
      status: "in-progress",
    });
    const machineOperation = callUpdate.conference_id
      ? await getPredictiveMachineOperation({
          workspaceId: workspace,
          callSid: callUpdate.sid,
          conferenceId: callUpdate.conference_id,
        })
      : null;
    if (conferences.length && needsPredictiveTerminalContinuation(status) && !machineOperation) {
      await triggerAutoDialer(dbCall);
    }
  } catch (error) {
    logger.error("Error in handleCallStatus:", error);
    throw error;
  }
};

async function handleFundedConferenceEvent(
  context: Awaited<ReturnType<typeof bindPredictiveConferenceEvent>>, event: Extract<TwilioVoiceCallback, { kind: "participant" }>,
) {
      if (context.audio) {
        await handleBoundVoiceAudioParticipant(context.reservation.workspace, context.audio.conference_callback, event);
        return;
      }
      if (await isRetiredVoiceAudioSource({ workspaceId: context.reservation.workspace, accountSid: context.reservation.account_sid,
        conferenceId: context.reservation.conference_id ?? "", callSid: context.call.sid })) return;
      const twilio = await createOriginalVoiceAccountClient(context.reservation);
      if (isParticipantJoin(event)) {
        if (context.setup && context.reservation.setup_sid === context.call.sid) {
          const first = await claimFirstPredictiveRecipient(context.reservation, context.call.sid);
          if (first?.send) await sendFundedPredictiveRecipient(first.reservation, twilio);
          else if (first) await stopRefusedPredictiveSetup(first.reservation, twilio);
        }
        await handlePredictiveParticipantJoin(event, context.call);
      } else if (isParticipantHangup(event)) await handleConferenceParticipantHangup(event, context.call, twilio);
}

export const action = defineAction({
  auth: async ({ request }) => {
    // Clone before reading — Bun yields empty params on re-read after consume.
    const formData = await request.clone().formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    // Read the raw call identity for signature lookup. Normalize aliases only
    // after signature validation, then parse the verified event for dispatch.
    let event = parseTwilioVoiceCallback(params);

    const callSidValue = event.callSid;
    if (!callSidValue) {
      throw new Error("Missing CallSid");
    }

    const forbidden = await requireTwilioSignature(request, {
      callSid: callSidValue,
      params,
    });
    if (forbidden) return forbidden;
    if (Array.from(formData.keys()).some((key) => formData.getAll(key).length !== 1) || !normalizeVerifiedVoiceParams(params))
      return twilioWebhookForbiddenHangup();
    event = parseTwilioVoiceCallback(params);
    let conferenceEvent: Awaited<ReturnType<typeof bindPredictiveConferenceEvent>> | null = null;
    let setupStatus = false;
    const query = new URL(request.url).searchParams;
    if (event.kind === "participant") {
      if (query.get("conference_events") === "1") {
        try {
          conferenceEvent = await bindPredictiveConferenceEvent({
            reservationId: query.get("credit_reservation") ?? "", requestUrl: resolveCanonicalTwilioWebhookUrl(request),
            accountSid: event.accountSid ?? "", callSid: callSidValue,
            conferenceId: event.conferenceName ?? "", conferenceSid: event.conferenceSid ?? "",
            event: event.event, participantLabel: params.ParticipantLabel, muted: params.Muted,
          });
        } catch { return twilioWebhookForbiddenHangup(); }
      } else if (await hasVoiceReservationCallBinding(callSidValue)) return twilioWebhookForbiddenHangup();
    } else if (query.get("credit_leg") === "setup") {
      const bound = await bindVerifiedFundedCallStatus(request, params);
      if (bound instanceof Response) return bound;
      if (!bound?.setup) return twilioWebhookForbiddenHangup();
      setupStatus = true;
    } else {
      const blocked = await bindVerifiedVoiceReservationRequest(request, params, "status");
      if (blocked) return blocked;
      event = parseTwilioVoiceCallback(params);
    }
    return { event, callSidValue, funded: query.has("credit_reservation"), conferenceEvent, setupStatus };
  },
  sideEffects: ["db-write", "credit", "twilio"],
  handler: async ({ auth, request }) => {
    const { event, callSidValue, funded, conferenceEvent, setupStatus } = auth;
    try {
    if (setupStatus) return routeData({ success: true });
    if (conferenceEvent && event.kind === "participant") {
      await handleFundedConferenceEvent(conferenceEvent, event);
      return routeData({ success: true });
    }
    let dbCall = await findCallBySid(callSidValue);
    if (!dbCall?.workspace) {
      await recordPredictiveSuccessorCallback(request, event.raw);
      dbCall = await findCallBySid(callSidValue);
    }
    if (!dbCall?.workspace) {
      // Unattributable callback (unknown CallSid, or a call row that never
      // got a workspace). Throwing here yields a 500, and Twilio retries 5xx
      // — forever, for a call that will never exist. Ack instead.
      logger.warn("auto-dial status: no call row for CallSid; acking to stop retries", {
        callSid: callSidValue,
      });
      return routeData({ success: true, resolved: false });
    }

    if (funded && event.kind !== "participant") {
      const { call } = await processCallStatusWebhook(buildCallUpsertFromTwilioParams(event.raw), {
        workspaceId: dbCall.workspace, skipBilling: true,
      });
      const outcome = await enqueueCallStatusSideEffects(call, event.raw);
      await runCallStatusSideEffects({ callSid: call.sid, event: outcome });
      return routeData({ success: true });
    }

    const twilio = await createWorkspaceTwilioInstance({ workspace_id: requireValue(dbCall.workspace, "workspace"),
    });
    if (isParticipantHangup(event)) {
      await handleConferenceParticipantHangup(event, dbCall, twilio);
      return routeData({ success: true });
    }
    const callStatusValue = event.callStatus;

    // Predictive contact calls send their status callbacks HERE, not to
    // /api/call-status — so this route is the only place that can push
    // dialer-room state (predictive_broadcast) to waiting agents. Emit for
    // contact legs on every status update, before the heavier handling below,
    // so agents see dialing/connected/outcome even if that handling errors.
    // Best-effort by design: emitPredictiveBroadcast never throws.
    if (dbCall.contact_id && callStatusValue) {
      const broadcast = predictiveCustomerBroadcast(dbCall, callStatusValue.toLowerCase());
      if (broadcast) await emitPredictiveBroadcast(requireValue(dbCall.workspace, "workspace"), broadcast);
    }
    switch (callStatusValue) {
      case "failed":
      case "busy":
      case "no-answer":
      case "completed":
        // Replay guard, done atomically: claim the terminal-status transition
        // with a compare-and-set UPDATE. Only the delivery that actually moves
        // the row to this status proceeds; a Twilio retry or a CONCURRENT
        // duplicate of the SAME terminal status loses the claim and acks. The
        // old check-then-act (compare a pre-read snapshot) let two overlapping
        // deliveries both pass and each re-dequeue + place a NEW outbound call.
        {
          const claimed = await claimTerminalCallStatus(
            requireValue(dbCall.workspace, "workspace"),
            callSidValue,
            callStatusValue,
          );
          if (!claimed) {
            logger.info("auto-dial status: terminal status already applied; acking replay", {
              callSid: callSidValue,
              status: callStatusValue,
            });
            return routeData({ success: true, replay: true });
          }
        }
        await handleCallStatus(
          event,
          dbCall,
          twilio,
          callStatusValue?.toLowerCase() as Tables<"call">["status"],
        );
        break;
      default:
        if (isParticipantJoin(event)) {
          await handlePredictiveParticipantJoin(event, dbCall);
        }
    }

    return routeData({ success: true });
  } catch (error: unknown) {
    logger.error("Error processing action:", error);
    return routeData(
      { error: "Failed to process action: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  }
  },
});

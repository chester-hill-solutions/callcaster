import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { Call } from '@/lib/types';
import type TwilioSDK from "twilio";
import { call as callTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";
import {
  rpcResetStaleCampaignQueueClaims,
} from "@/lib/db-rpc.server";
import { recheckCampaignCompletion } from "@/lib/campaign-completion.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";
import { updateCallBySid } from "@/lib/telephony-db.server";
import { admitPredictiveVoiceRecipient, type PredictiveVoiceAdmissionInput } from "@/server/predictive-voice-admission.server";
import type { VoiceReservation, VoiceDispatchUrls } from "@/server/voice-credit-reservation.server";
import { dispatchStartedVoiceCall, isDefiniteVoiceCreateRejection, VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { dequeueFundedVoiceAttempt } from "@/server/voice-attempt-queue.server";
import { refuseFirstPredictiveRecipient } from "@/server/predictive-conference-reservation.server";
import { PredictiveContinuationStoppedError } from "@/server/predictive-voice-receipt.server";

type TwilioClient = TwilioSDK.Twilio;

export async function createTwilioCall(
  client: TwilioClient,
  toNumber: string,
  fromNumber: string,
  conference_id: string,
  urls?: VoiceDispatchUrls,
) {
  return client.calls.create({
    to: toNumber,
    from: fromNumber,
    url: urls?.voiceUrl ?? `${env.BASE_URL()}/api/auto-dial/${conference_id}`,
    machineDetection: "Enable",
    statusCallbackEvent: ["answered", "completed", "ringing"],
    statusCallback: urls?.statusCallback ?? `${env.BASE_URL()}/api/auto-dial/status`,
  });
}

function buildCallRow(callData: Partial<Call>) {
  if (!callData.sid) {
    throw new Error(
      "buildCallRow requires callData.sid; Twilio call data must include the Call SID",
    );
  }
  return {
    sid: callData.sid,
    account_sid: callData.account_sid || null,
    to: callData.to || null,
    from: callData.from || null,
    status: callData.status || null,
    start_time: callData.start_time ?? null,
    end_time: callData.end_time ?? null,
    duration: callData.duration ? String(callData.duration) : null,
    price: callData.price ? String(callData.price) : null,
    direction: callData.direction || null,
    answered_by: callData.answered_by || null,
    api_version: callData.api_version || null,
    forwarded_from: callData.forwarded_from || null,
    group_sid: callData.group_sid || null,
    caller_name: callData.caller_name || null,
    uri: callData.uri || null,
    user_id: callData.user_id || null,
    campaign_id: callData.campaign_id || null,
    contact_id: callData.contact_id || null,
    outreach_attempt_id: callData.outreach_attempt_id || null,
    queue_id: callData.queue_id || null,
    conference_id: callData.conference_id || null,
    phone_number_sid: callData.phone_number_sid || null,
    parent_call_sid: callData.parent_call_sid || null,
    date_updated: callData.date_updated ?? null,
  };
}

export async function saveCallToDatabase(
  workspaceId: string,
  callData: Partial<Call>,
  options?: { tdb?: TenantDb },
) {
  if (!callData.sid) {
    logger.error("Cannot save call without sid");
    return false;
  }

  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const row = buildCallRow(callData);

  try {
    const existing = await tdb.call.findFirst({
      where: eq(callTable.sid, callData.sid),
    });
    if (existing) {
      // A status callback can land before this post-create write; route the
      // update through the guarded helper so a terminal status is never
      // regressed to the create-response status (e.g. `queued`).
      await updateCallBySid(
        workspaceId,
        callData.sid,
        row as Parameters<typeof updateCallBySid>[2],
        { tdb },
      );
      return true;
    }
    await tdb.call.insert({
      ...row,
      date_created: new Date(),
      is_last: false,
    });
    return true;
  } catch (error) {
    // Swallowed so a late status callback can't be blocked by a transient write
    // failure. Callers that need to know whether the row landed (e.g. the dial
    // path's redial guard) must check the returned boolean.
    logger.error("Error saving the call to the database:", error);
    return false;
  }
}

export async function completeAllConferences(client: TwilioClient, conferenceId: string) {
  const isSid = conferenceId.startsWith("CF");
  if (isSid) {
    try {
      await client.conferences(conferenceId).update({ status: "completed" as const });
    } catch (error) {
      logger.error(`Error completing conference ${conferenceId}:`, error);
    }
    return;
  }

  const conferences = await client.conferences.list({
    friendlyName: conferenceId,
    status: "in-progress" as const,
  });
  await Promise.all(
    conferences.map(({ sid }) =>
      client.conferences(sid).update({ status: "completed" as const }),
    ),
  );
}

export type AutoDialerTurnInput = {
  user_id: string;
  campaign_id: number | string;
  workspace_id: string;
  selected_device?: string;
  conference_id?: string | null;
  /** Durable predictive continuation checkpoints; ordinary dial turns omit them. */
  continuation?: Pick<PredictiveVoiceAdmissionInput, "operationId" | "lockTurn" | "prepareSend"> & {
    afterDial: (callData: Partial<Call>) => Promise<void>;
  };
};

export type AutoDialerTurnResult =
  | { success: true; message?: string }
  | {
      success: false;
      error: string;
      failureKind?: "not-sent" | "rejected" | "uncertain" | "stopped";
    };

/**
 * Advances the predictive dialer by one turn: claims the next queued contact
 * for the campaign and places a call, or completes the conference if the
 * queue is empty.
 *
 * Callers that need to trigger the next dialer turn invoke this in-process
 * rather than issuing an HTTP self-fetch under `/api/auto-dial` — that path
 * matches the Twilio webhook prefix, so an unsigned self-fetch is rejected
 * with 403 by `requireTwilioSignature` whenever signature validation is
 * enabled (always in production). The old public `/api/auto-dial/dialer`
 * route was deleted in the SEC-02 hardening; the authenticated entry point is
 * the workspace campaign `dialer/start` action. See server/twilio-webhook.ts.
 */
export async function runAutoDialerTurn(
  input: AutoDialerTurnInput,
): Promise<AutoDialerTurnResult> {
  const { user_id, workspace_id } = input;
  const campaign_id = Number(input.campaign_id);
  const conferenceId = input.conference_id || user_id;

  const twilioClient = await createWorkspaceTwilioInstance({ workspace_id });
  const tdb = createTenantDb(workspace_id);

  if (conferenceId && conferenceId.includes("~")) {
    const activeConfs = await twilioClient.conferences.list({
      friendlyName: conferenceId,
      status: "in-progress",
      limit: 1,
    });
    if (!activeConfs.length) {
      return { success: true, message: "Conference ended, stopping auto-dial" };
    }
  }

  // Sweep before claiming. A claim is only released by the turn that made it,
  // so a turn that dies between claiming and dialling strands the row as
  // `assigned` forever — and once that claim goes stale
  // campaign_queue_has_pending_work stops counting it, so the campaign reports
  // itself drained with contacts still undialled. Sweeping here repairs it at
  // exactly the moment it matters, with no scheduler involved — the same
  // shape claimAgentForQueue uses for inbound offers.
  // Best-effort: a failed sweep must not stop this turn from dialling.
  try {
    const reclaimed = await rpcResetStaleCampaignQueueClaims(tdb, campaign_id);
    if (reclaimed > 0) {
      logger.info("auto_dial.stale_claims_reset", { campaignId: campaign_id, reclaimed });
    }
  } catch (error) {
    logger.error("reset_stale_campaign_queue_claims RPC error", error);
  }

  let failureKind: "not-sent" | "rejected" | "uncertain" = "not-sent";
  try {
    const admitted = await admitPredictiveVoiceRecipient({
      workspaceId: workspace_id, campaignId: campaign_id, userId: user_id,
      conferenceId, accountSid: twilioClient.accountSid,
      operationId: input.continuation?.operationId,
      lockTurn: input.continuation?.lockTurn,
      prepareSend: input.continuation?.prepareSend,
    });
    if (!admitted.ok) {
      if (admitted.reason === "queue_empty") {
        await completeAllConferences(twilioClient, conferenceId);
        await recheckCampaignCompletion({ campaignId: campaign_id, workspaceId: workspace_id, exec: tdb, reason: "auto_dial_drain" });
        return { success: true, message: "No queued contacts" };
      }
      if (input.continuation) return { success: false, failureKind: "not-sent", error: `Predictive admission deferred: ${admitted.reason}` };
      return { success: true, message: `Predictive admission deferred: ${admitted.reason}` };
    }
    failureKind = "uncertain";
    try {
      await sendFundedPredictiveRecipient(admitted.reservation, twilioClient, input.continuation?.afterDial);
      return { success: true };
    } catch (error) {
      if (!(error instanceof VoiceDispatchUncertainError) && isDefiniteVoiceCreateRejection(error)) failureKind = "rejected";
      throw error;
    }

  } catch (error) {
    if (error instanceof PredictiveContinuationStoppedError) return { success: false, failureKind: "stopped", error: error.message };
    logger.error("Error dialing number:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage, failureKind };
  }
}

/** Initial and successor recipients use the same committed funding and send seam. */
export async function sendFundedPredictiveRecipient(
  reservation: VoiceReservation, client: TwilioClient, afterDial?: (callData: Partial<Call>) => Promise<void>,
) {
  const { conference_id: conferenceId, voice_url: voiceUrl, status_callback: statusUrl } = reservation;
  if (client.accountSid !== reservation.account_sid || !conferenceId || !voiceUrl || !statusUrl)
    throw new Error("Predictive provider binding does not match");
  try {
    const sent = await dispatchStartedVoiceCall(reservation, () => createTwilioCall(client, reservation.recipient,
      reservation.caller_id, conferenceId, { voiceUrl, statusCallback: statusUrl }));
    await dequeueFundedVoiceAttempt(reservation);
    const call = sent.call;
    if (!call) return;
      // `call.dateUpdated`/`startTime`/`endTime` are `Date` in the Twilio SDK's
      // `CallInstance` type, and `Call.date_updated`/`start_time`/`end_time` are
      // `timestamptz` — so they are handed over as the Dates they already are,
      // and `callData` stays a real `Partial<Call>` the compiler checks. The
      // `? … : null` guards are defensive: Twilio's docs note these fields come
      // back empty for a call that hasn't started/ended yet, despite the SDK
      // typing them as always-present.
      const callData: Partial<Call> = {
        sid: call.sid,
        date_updated: call.dateUpdated ?? null,
        parent_call_sid: call.parentCallSid,
        account_sid: call.accountSid,
        to: reservation.recipient,
        from: call.from,
        phone_number_sid: call.phoneNumberSid,
        status: call.status,
        start_time: call.startTime ?? null,
        end_time: call.endTime ?? null,
        duration: call.duration,
        price: call.price,
        direction: call.direction,
        answered_by: call.answeredBy,
        api_version: call.apiVersion,
        forwarded_from: call.forwardedFrom,
        group_sid: call.groupSid,
        caller_name: call.callerName,
        uri: call.uri,
        campaign_id: reservation.campaign_id,
        contact_id: reservation.contact_id,
        workspace: reservation.workspace,
        outreach_attempt_id: reservation.outreach_attempt_id,
        conference_id: reservation.conference_id,
        queue_id: reservation.queue_id, user_id: reservation.user_id,
      };

      await afterDial?.(callData);

      if (!(await saveCallToDatabase(reservation.workspace, callData))) {
        throw new VoiceDispatchUncertainError(reservation.id, new Error("Accepted predictive call record needs recovery"));
      }

  } catch (error) {
    if (!(error instanceof VoiceDispatchUncertainError) && isDefiniteVoiceCreateRejection(error) && reservation.queue_id) {
      if (reservation.setup_sid) {
        await stopRefusedPredictiveSetup(await refuseFirstPredictiveRecipient(reservation), client);
        throw error;
      }
      await requeueCampaignQueueById(reservation.queue_id, reservation.workspace, {
        expectedGeneration: reservation.queue_generation ?? undefined, userId: reservation.user_id ?? undefined,
        voiceReservationId: reservation.id,
      });
    }
    throw error;
  }
}

export async function stopRefusedPredictiveSetup(reservation: VoiceReservation, client: TwilioClient) {
  if (!reservation.setup_sid || !reservation.recipient_refused_at || client.accountSid !== reservation.account_sid)
    throw new Error("Predictive setup stop has no owned refusal");
  try { await client.calls(reservation.setup_sid).update({ status: "completed" }); }
  catch (error) { logger.error("predictive.setup_stop_pending", error); }
}

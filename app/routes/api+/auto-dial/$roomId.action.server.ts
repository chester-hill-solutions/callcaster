import { predictiveMachineResponse } from "@/lib/predictive-machine.server";
import { Call } from "@/lib/types";
import { Tables } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { logger } from "@/lib/logger.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import {
  findCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { normalizeVerifiedVoiceParams } from "@/lib/twilio/verified-voice-params";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { readTwilioWebhookStringParams, requireTwilioSignature, twilioWebhookForbiddenHangup } from "@/lib/twilio-webhook.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import { isMachineAnswered } from "@/lib/ivr-machine.server";
import { bindVerifiedVoiceSetupRequest } from "@/lib/voice-bridge-webhook.server";
import { bindVerifiedVoiceReservationRequest } from "@/lib/voice-reservation-webhook.server";
import { predictiveConferenceCallbackUrl } from "@/server/predictive-conference-reservation.server";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import { findVoiceReservationForCall } from "@/server/voice-bridge-reservation.server";
import { findVoicePhoneCustomerOwner } from "@/server/voice-phone-customer.server";
import { voicePhoneCustomerInstruction } from "@/lib/voice-phone-customer.server";
import { claimPredictiveHumanInstruction } from "@/server/predictive-human-admission.server";

function resolveUserIdFromConferenceName(conferenceName: string): string {
    // Conference names are generated as `${userId}~${uuid}`. The user id is a UUID,
    // so we split on the non-hex separator to recover the original user id.
    const sep = conferenceName.indexOf('~');
    if (sep === -1) return conferenceName;
    return conferenceName.slice(0, sep);
}

const fetchCallData = async (callSid: string): Promise<NonNullable<Partial<Call>>> => {
  const row = await findCallBySid(callSid);
  if (!row) {
    throw new Error(`Error fetching call data: call ${callSid} not found`);
  }
  return row;
};

const fetchCampaignData = async (campaignId: string, workspaceId: string) => {
  const row = await fetchCampaignByIdForWorkspace(workspaceId, campaignId);
  return {
    voicemail_drop_enabled: row.voicemail_drop_enabled,
    voicemail_file: row.voicemail_file,
    group_household_queue: row.group_household_queue,
    caller_id: row.caller_id,
  };
};

const updateOutreachAttempt = async (
  attemptId: string,
  workspaceId: string,
  update: Partial<Tables<"outreach_attempt">>,
) => {
  const result = await updateOutreachAttemptForWorkspace(workspaceId, attemptId, update);
  if (result instanceof Response) {
    throw new Error(`Error updating outreach attempt: ${await result.text()}`);
  }
  return [result];
};

const triggerAutoDialer = async (conferenceId: string, campaignId: string, workspaceId: string, userId: string) => {
    // Call the dialer turn in-process rather than self-fetching
    // `/api/auto-dial/dialer`: that path is matched by the Twilio webhook
    // prefix `/api/auto-dial`, so an unsigned self-fetch would be rejected
    // with 403 by requireTwilioSignature (always enforced in production).
    await runAutoDialerTurn({
        user_id: userId,
        campaign_id: campaignId,
        workspace_id: workspaceId,
        conference_id: conferenceId,
    });
};

const handleHumanAnswer = async (dbCall: NonNullable<Partial<Call>>, called: string, callbackUrl?: string) => {
    const twiml = createVoiceResponse();
    const conferenceName = dbCall.conference_id?.toString() ?? '';

    if (dbCall.outreach_attempt_id && !called.startsWith('client')) {
        await updateOutreachAttempt(
          String(dbCall.outreach_attempt_id),
          dbCall.workspace?.toString() ?? "",
          { answered_at: new Date().toISOString() },
        );
    }

    // A statusCallback here — mirroring the agent's own leg in
    // addToConference — is what lets a CLIENT hangup be detected at all.
    // Without it, Twilio never posts a participant-leave event for this
    // leg, so the app has no server-driven signal and depends entirely on
    // Twilio's platform-level endConferenceOnExit reaching the agent's
    // browser. handleParticipantLeave (auto-dial/status) already forces the
    // conference closed on `participant_hung_up` for whichever leg posts
    // it — it just never received the contact's events before.
    const dial = twiml.dial();
    dial.conference({
        beep: 'onExit',
        endConferenceOnExit: true,
        statusCallback: callbackUrl ?? `${env.BASE_URL()}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
    }, `${conferenceName}`);

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleDeviceCheck = async (dbCall: NonNullable<Partial<Call>>) => {
    const conferenceId = dbCall.conference_id?.toString() ?? '';
    const userId = resolveUserIdFromConferenceName(conferenceId);
    return addToConference({ conferenceId, campaignId: String(dbCall.campaign_id ?? ''), workspaceId: dbCall.workspace?.toString() ?? '', userId, callSid: dbCall.sid ?? '' });
};

async function handleFundedHumanAnswer(request: Request, dbCall: NonNullable<Partial<Call>>, called: string, params: Record<string, string>) {
  const funded = new URL(request.url).searchParams.has("credit_reservation")
    ? await findVoiceReservationForCall(String(dbCall.workspace ?? ""), dbCall.sid ?? "") : null;
  if (funded?.audio_connection_id) return await voicePhoneCustomerInstruction(request, funded, params, "predictive")
    ?? new Response(hangupTwiml(), { headers: { "Content-Type": "text/xml" } });
  if (funded && !await claimPredictiveHumanInstruction(funded)) return new Response(hangupTwiml(), { headers: { "Content-Type": "text/xml" } });
  return handleHumanAnswer(dbCall, called, funded ? predictiveConferenceCallbackUrl(funded) : undefined);
}

async function addToConference(context: { conferenceId: string; campaignId: string; workspaceId: string; userId: string; callSid: string }, funded?: VoiceReservation) {
    const { conferenceId, campaignId, workspaceId, userId, callSid } = context;
    const twiml = createVoiceResponse();
    const workspace = await getWorkspaceById(workspaceId);
    appendLiveTranscriptionStreamTwiml({
        twiml,
        featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
        params: {
            workspaceId,
            userId,
            direction: "predictive",
            campaignId,
            // This leg's Call SID. Without it the token cannot be bound to the
            // call, and the service's writes are keyed by call SID alone.
            callSid,
            streamName: `conf-${conferenceId}`,
        },
    });
    const dial = twiml.dial();
    dial.conference({
        beep: 'false',
        statusCallback: funded ? predictiveConferenceCallbackUrl(funded) : `${env.BASE_URL()}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
        endConferenceOnExit: false,
    }, conferenceId);
    if (!funded) await triggerAutoDialer(conferenceId, campaignId, workspaceId, userId);
    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
}

const checkUserDevices = async (contactId: string, conferenceName: string, called: string, callerId: string) => {
    const userId = resolveUserIdFromConferenceName(conferenceName);
    const verifiedNumbers = await getUserVerifiedAudioNumbers(userId);
    if (!verifiedNumbers?.length) return false;
    if (called.includes('client')) return true;
    if (called === callerId) return true;
    if (!contactId && verifiedNumbers.includes(called)) return true;
    return false;
}

async function handleFundedSetup(request: Request, callbackParams: Record<string, string>, conferenceName: string, callSid: string) {
  const funded = await bindVerifiedVoiceSetupRequest(request, callbackParams);
  if (funded instanceof Response) return funded;
  if (funded.conference_id !== conferenceName || funded.state === "released" || funded.state === "settled" || funded.setup_terminal_at)
    return new Response(hangupTwiml(), { headers: { "Content-Type": "text/xml" } });
  return addToConference({ conferenceId: conferenceName, campaignId: String(funded.campaign_id ?? ""),
    workspaceId: funded.workspace, userId: funded.user_id ?? "", callSid }, funded);
}

export const action = defineAction({
  auth: async ({ request }) => {
    const callbackParams = await readTwilioWebhookStringParams(request);
    if (!callbackParams) return twilioWebhookForbiddenHangup();
    const callSid = callbackParams.CallSid ?? callbackParams.call_sid;
    const owner = await findVoicePhoneCustomerOwner(new URL(request.url).searchParams.get("credit_reservation") ?? "");
    const forbidden = await requireTwilioSignature(request, { callSid, params: callbackParams,
      ...(owner?.audio_connection_id ? { workspaceId: owner.workspace, expectedAccountSid: owner.account_sid } : {}) });
    if (forbidden) return forbidden;
    if (!normalizeVerifiedVoiceParams(callbackParams)) return twilioWebhookForbiddenHangup();
    const event = parseTwilioVoiceCallback(callbackParams);
    if (!event.callSid) return new Response(hangupTwiml(), { status: 400, headers: { "Content-Type": "text/xml" } });
    return { callbackParams, callSid: event.callSid, answeredBy: event.answeredBy ?? "", callStatus: event.callStatus,
      called: callbackParams.Called ?? callbackParams.To ?? "" };
  },
  sideEffects: ["db-read", "db-write", "twilio", "external"],
  handler: async ({ request, params, auth }) => {
    const conferenceName = params.roomId as string;
    const { callbackParams, callSid, answeredBy, callStatus, called } = auth;

    let response: Response;

    try {
      const query = new URL(request.url).searchParams;
      if (query.get("credit_leg") === "setup") return handleFundedSetup(request, callbackParams, conferenceName, callSid);
      const blocked = await bindVerifiedVoiceReservationRequest(request, callbackParams, "voice");
      if (blocked) return blocked;
      const dbCall = await fetchCallData(callSid);
      if (query.has("credit_reservation") && dbCall.conference_id !== conferenceName)
        return new Response(hangupTwiml(), { status: 403, headers: { "Content-Type": "text/xml" } });
      const machinePhase = query.get("machine");
      const workspaceId = String(dbCall.workspace ?? ""), campaignId = String(dbCall.campaign_id ?? "");
      const binding = {
        workspaceId,
        callSid,
        conferenceId: conferenceName,
      };
      if (machinePhase)
        return await predictiveMachineResponse(
          binding,
          machinePhase,
          query.get("operation"),
        );
      const campaign = await fetchCampaignData(campaignId, workspaceId);

      if (
        !query.has("credit_reservation") && await checkUserDevices(
          String(dbCall.contact_id ?? ""),
          conferenceName,
          called,
          String(campaign.caller_id ?? ""),
        )
      ) {
        return await handleDeviceCheck(dbCall);
      } else {
        //This is a non-client device (outbound call)
        if (isMachineAnswered(answeredBy, callStatus)) {
          response = await predictiveMachineResponse(binding);
        } else {
          //This is a human answer
          response = await handleFundedHumanAnswer(request, dbCall, called, callbackParams);
        }
      }
    } catch (error) {
      logger.error("General error:", error);
      response = new Response(hangupTwiml(), {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      });
    }

    return response;
  },
});

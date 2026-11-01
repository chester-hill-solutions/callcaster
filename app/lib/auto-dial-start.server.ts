import { data as routeData } from "react-router";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { OUTBOUND_CREDITS_BLOCKED_BODY } from "@/lib/outbound-credit-gate.server";
import { logger } from "@/lib/logger.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import { admitPredictiveVoiceRecipient, replayPredictiveConferenceStart } from "@/server/predictive-voice-admission.server";
import { dispatchStartedVoiceSetup } from "@/lib/manual-voice-dispatch.server";
import { isDefiniteVoiceCreateRejection, VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";
import { verifyVoiceAudioCustomerSource } from "@/lib/voice-audio-customer-source.server";
import { sendFundedPredictiveRecipient } from "@/lib/auto-dial.server";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import { predictiveStartIdentity } from "@/lib/predictive-start-identity.server";
import type { PredictiveConferenceStartIdentity } from "@/server/predictive-start-replay.server";
import type { VoiceAudioCustomerIntent } from "@/server/voice-audio-customer-admission.server";
import type { Twilio } from "twilio";

export type StartAutoDialConferenceInput = {
  userId: string;
  workspaceId: string;
  campaignId: number;
  callerId: string;
  selectedDevice: string;
  dialIntentId?: string;
  audioSource?: { connectionId: string; generation: number };
};

export type StartAutoDialConferenceResult =
  | { ok: true; conferenceName: string; callSid?: string }
  | { ok: false; status: number; error: string; creditsError?: boolean };

export async function startAutoDialConference(
  input: StartAutoDialConferenceInput,
): Promise<StartAutoDialConferenceResult> {
  const { userId, workspaceId, selectedDevice } = input;
  const parsed = predictiveStartIdentity(input);
  if (!parsed.ok) return parsed;
  const { identity, conferenceName, audioSource } = parsed;
  const replay = await replayPredictiveConferenceStart(identity);
  if (replay) return admissionFailure(replay, conferenceName, Boolean(audioSource));
  if (selectedDevice !== "computer" && !(await getUserVerifiedAudioNumbers(userId))?.includes(selectedDevice)) {
    return { ok: false, status: 400, error: "Selected device is not a verified phone number" };
  }
  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  let reservation: VoiceReservation | undefined;
  try {
    const admitted = audioSource ? await admitPhoneStart(identity, audioSource, twilio.accountSid)
      : await admitPredictiveVoiceRecipient({ ...identity, conferenceId: conferenceName, accountSid: twilio.accountSid, audioSource: undefined });
    if (!admitted.ok) return admissionFailure(admitted, conferenceName, Boolean(audioSource));
    reservation = admitted.reservation;
    if (audioSource) {
      if (!reservation.conference_id) throw new Error("Predictive phone room is missing");
      const callSid = await sendFundedPredictiveRecipient(reservation, twilio);
      return { ok: true, conferenceName: reservation.conference_id, callSid };
    }
    await sendPredictiveSetup(reservation, twilio);
    return { ok: true, conferenceName };
  } catch (error) {
    return failedStart(error, reservation, Boolean(audioSource));
  }
}

async function admitPhoneStart(identity: PredictiveConferenceStartIdentity, audioSource: VoiceAudioCustomerIntent, accountSid: string) {
  const source = await verifyVoiceAudioCustomerSource({ workspaceId: identity.workspaceId, userId: identity.userId,
    campaignId: identity.campaignId, connectionId: audioSource.connectionId, generation: audioSource.generation, phoneNumber: audioSource.destination });
  if (!source.ok) return { ok: false as const, reason: "audio_source_unavailable" as const };
  return admitPredictiveVoiceRecipient({ ...identity, accountSid, conferenceId: source.proof.conferenceId,
    audioSource: { ...audioSource, proof: source.proof } });
}

async function sendPredictiveSetup(reservation: VoiceReservation, twilio: Twilio) {
  const { setup_to: setupTo, setup_voice_url: voiceUrl, setup_status_callback: statusUrl, queue_id: queueId } = reservation;
  if (!setupTo || !voiceUrl || !statusUrl || !queueId) throw new Error("Predictive setup checkpoint is incomplete");
  return dispatchStartedVoiceSetup(reservation, () => twilio.calls.create({ to: setupTo, from: reservation.caller_id, url: voiceUrl,
    statusCallback: statusUrl, statusCallbackEvent: ["answered", "completed", "ringing"] }));
}

async function failedStart(error: unknown, reservation: VoiceReservation | undefined, adopted: boolean): Promise<StartAutoDialConferenceResult> {
  if (reservation?.queue_id && !adopted && !(error instanceof VoiceDispatchUncertainError) && isDefiniteVoiceCreateRejection(error))
    await requeueCampaignQueueById(reservation.queue_id, reservation.workspace, {
      expectedGeneration: reservation.queue_generation ?? undefined, userId: reservation.user_id ?? undefined, voiceReservationId: reservation.id,
    });
  logger.error("Error starting conference", error);
  if (error instanceof VoiceDispatchUncertainError) return { ok: false, status: 409, error: "Call creation needs provider verification" };
  if (error instanceof VoiceAudioBindingError) return { ok: false, status: 409, error: "Phone audio changed before customer send" };
  return { ok: false, status: 500, error: "Unable to start call" };
}

function admissionFailure(
  refusal: Extract<Awaited<ReturnType<typeof admitPredictiveVoiceRecipient>>, { ok: false }>, conferenceName: string, adopted = false,
): StartAutoDialConferenceResult {
    if (refusal.reason === "already_dispatched") {
      const savedRoom = "conferenceName" in refusal && typeof refusal.conferenceName === "string" ? refusal.conferenceName : undefined;
      if (adopted && !savedRoom) return { ok: false, status: 409, error: "Accepted phone room needs recovery" };
      return { ok: true, conferenceName: savedRoom ?? conferenceName, ...(adopted ? { callSid: refusal.callSid } : {}) };
    }
    if (refusal.reason === "insufficient_credits") return { ok: false, status: 402, error: "Insufficient credits", creditsError: true };
    if (refusal.reason === "workspace_not_found" || refusal.reason === "campaign_not_found")
      return { ok: false, status: 404, error: refusal.reason === "workspace_not_found" ? "Workspace not found" : "Campaign not found" };
    if (refusal.reason === "caller_id_unavailable") return { ok: false, status: 400, error: refusal.message };
    const messages: Partial<Record<typeof refusal.reason, string>> = {
      queue_empty: "No queued contacts", outside_window: "No contacts within recipient calling hours",
      campaign_deferred: "Campaign is not currently active", campaign_stopped: "Campaign is not currently active",
      dialer_stopped: "This dialer request was stopped. Start a new session.",
    };
    return { ok: false, status: 409, error: messages[refusal.reason] ?? "A call is awaiting completion or recovery" };

}

export type AutoDialCreditsErrorResponse = ReturnType<typeof routeData>;

export function autoDialCreditsErrorResponse(): AutoDialCreditsErrorResponse {
  return routeData(OUTBOUND_CREDITS_BLOCKED_BODY, { status: 402 });
}

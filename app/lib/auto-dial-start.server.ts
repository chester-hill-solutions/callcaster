import { data as routeData } from "react-router";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { OUTBOUND_CREDITS_BLOCKED_BODY } from "@/lib/outbound-credit-gate.server";
import { logger } from "@/lib/logger.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import { randomUUID } from "node:crypto";
import { admitPredictiveVoiceRecipient, replayPredictiveConferenceStart } from "@/server/predictive-voice-admission.server";
import { dispatchStartedVoiceSetup } from "@/lib/manual-voice-dispatch.server";
import { isDefiniteVoiceCreateRejection, VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";

export type StartAutoDialConferenceInput = {
  userId: string;
  workspaceId: string;
  campaignId: number;
  callerId: string;
  selectedDevice: string;
  dialIntentId?: string;
};

export type StartAutoDialConferenceResult =
  | { ok: true; conferenceName: string }
  | { ok: false; status: number; error: string; creditsError?: boolean };

export async function startAutoDialConference(
  input: StartAutoDialConferenceInput,
): Promise<StartAutoDialConferenceResult> {
  const { userId, workspaceId, campaignId, callerId, selectedDevice } = input;
  const intent = (input.dialIntentId ?? randomUUID()).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intent))
    return { ok: false, status: 400, error: "Invalid dial intent" };
  const conferenceName = `${userId}~${intent}`;
  const identity = { workspaceId, campaignId, userId, conferenceId: conferenceName,
    setup: { to: selectedDevice === "computer" ? `client:${userId}` : selectedDevice, callerId, intentKey: `predictive-start:${intent}` } };
  const replay = await replayPredictiveConferenceStart(identity);
  if (replay) return admissionFailure(replay, conferenceName);
  if (selectedDevice !== "computer" && !(await getUserVerifiedAudioNumbers(userId))?.includes(selectedDevice)) {
    return { ok: false, status: 400, error: "Selected device is not a verified phone number" };
  }
  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  const admitted = await admitPredictiveVoiceRecipient({ ...identity, accountSid: twilio.accountSid });
  if (!admitted.ok) return admissionFailure(admitted, conferenceName);
  const reservation = admitted.reservation;
  const { setup_to: setupTo, setup_voice_url: voiceUrl, setup_status_callback: statusUrl, queue_id: queueId } = reservation;
  if (!setupTo || !voiceUrl || !statusUrl || !queueId) throw new Error("Predictive setup checkpoint is incomplete");
  try {
    await dispatchStartedVoiceSetup(reservation, () => twilio.calls.create({
      to: setupTo, from: reservation.caller_id, url: voiceUrl,
      statusCallback: statusUrl, statusCallbackEvent: ["answered", "completed", "ringing"],
    }));
    return { ok: true, conferenceName };
  } catch (error) {
    if (!(error instanceof VoiceDispatchUncertainError) && isDefiniteVoiceCreateRejection(error)) {
      await requeueCampaignQueueById(queueId, workspaceId, {
        expectedGeneration: reservation.queue_generation ?? undefined, userId, voiceReservationId: reservation.id,
      });
    }
    logger.error("Error starting conference", error);
    return { ok: false, status: error instanceof VoiceDispatchUncertainError ? 409 : 500,
      error: error instanceof VoiceDispatchUncertainError ? "Call creation needs provider verification" : "Unable to start call" };
  }
}

function admissionFailure(
  refusal: Extract<Awaited<ReturnType<typeof admitPredictiveVoiceRecipient>>, { ok: false }>, conferenceName: string,
): StartAutoDialConferenceResult {
    if (refusal.reason === "already_dispatched") return { ok: true, conferenceName };
    if (refusal.reason === "insufficient_credits") return { ok: false, status: 402, error: "Insufficient credits", creditsError: true };
    if (refusal.reason === "workspace_not_found" || refusal.reason === "campaign_not_found")
      return { ok: false, status: 404, error: refusal.reason === "workspace_not_found" ? "Workspace not found" : "Campaign not found" };
    if (refusal.reason === "caller_id_unavailable") return { ok: false, status: 400, error: refusal.message };
    const messages: Partial<Record<typeof refusal.reason, string>> = {
      queue_empty: "No queued contacts", outside_window: "No contacts within recipient calling hours",
      campaign_deferred: "Campaign is not currently active", campaign_stopped: "Campaign is not currently active",
    };
    return { ok: false, status: 409, error: messages[refusal.reason] ?? "A call is awaiting completion or recovery" };

}

export type AutoDialCreditsErrorResponse = ReturnType<typeof routeData>;

export function autoDialCreditsErrorResponse(): AutoDialCreditsErrorResponse {
  return routeData(OUTBOUND_CREDITS_BLOCKED_BODY, { status: 402 });
}

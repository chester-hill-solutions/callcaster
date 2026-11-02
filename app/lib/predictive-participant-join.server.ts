import type { Tables } from "@/lib/db-types";
import type { ParticipantJoinEvent, ParticipantLeaveEvent } from "@/lib/twilio/voice-callback";
import { findOutreachAttemptById, updateCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { logger } from "@/lib/logger.server";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import { predictiveCustomerBroadcast, predictiveCustomerParticipation } from "@/lib/predictive-customer-broadcast.server";
import { findVoiceReservationForCall } from "@/server/voice-bridge-reservation.server";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import { recordFundedPredictiveJoin } from "@/server/funded-predictive-join.server";
import { recordFundedPredictiveLeave } from "@/server/predictive-human-presence.server";

export async function handlePredictiveParticipantLeave(event: ParticipantLeaveEvent, call: Tables<"call">) {
  if (!call.workspace) return false;
  const owner = await findVoiceReservationForCall(call.workspace, call.sid);
  if (!owner) return false;
  const current = await recordFundedPredictiveLeave(owner, event);
  if (!current) return false;
  const participation = predictiveCustomerParticipation(event);
  const broadcast = participation ? predictiveCustomerBroadcast(current, "completed", participation) : null;
  if (broadcast) await emitPredictiveBroadcast(call.workspace, broadcast);
  return true;
}

async function publishJoin(event: ParticipantJoinEvent, call: Parameters<typeof predictiveCustomerBroadcast>[0]) {
  const participation = predictiveCustomerParticipation(event);
  const broadcast = participation ? predictiveCustomerBroadcast(call, "in-progress", participation) : null;
  if (broadcast && call.workspace) await emitPredictiveBroadcast(call.workspace, broadcast);
}

/** Both legacy and first-phone callbacks use the same predictive join effects. */
export async function handlePredictiveParticipantJoin(event: ParticipantJoinEvent, call: Tables<"call">) {
  try {
    if (!call.workspace) throw new Error("Missing required field: workspace");
    const reservation = await findVoiceReservationForCall(call.workspace, call.sid);
    if (reservation) {
      const current = await recordFundedPredictiveJoin(reservation, event);
      if (current) await publishJoin(event, current);
      return;
    }
    if (isTerminalStatus(normalizeProviderStatus(call.status))) return;
    let current = call;
    if (!call.conference_id) {
      if (!event.callSid || !event.conferenceRef || !event.timestamp) throw new Error("Missing predictive participant identity");
      const saved = await updateCallBySid(call.workspace, event.callSid, {
        conference_id: event.conferenceRef, start_time: new Date(event.timestamp),
      });
      if (!saved) throw new Error(`Call ${event.callSid} not found`);
      current = saved;
    }
    if (!call.outreach_attempt_id) return;
    if (!call.campaign_id) throw new Error("Missing campaign_id for participant join");
    const existing = await findOutreachAttemptById(call.workspace, call.outreach_attempt_id);
    if (!existing?.answered_at) {
      const attempt = await updateOutreachAttemptForWorkspace(call.workspace, String(call.outreach_attempt_id), {
        answered_at: new Date().toISOString(),
      });
      if (attempt instanceof Response) return;
    }
    await publishJoin(event, current);
  } catch (error) {
    logger.error("Error in handleParticipantJoin:", error);
    throw error;
  }
}

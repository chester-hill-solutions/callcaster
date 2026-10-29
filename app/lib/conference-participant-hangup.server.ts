import type Twilio from "twilio";
import type { Tables } from "@/lib/db-types";
import type { ParticipantLeaveEvent } from "@/lib/twilio/voice-callback";
import { emitPredictiveBroadcast } from "@/lib/workspace-events.server";
import { updateCallBySid } from "@/lib/telephony-db.server";
import { findVoiceReservationForCall } from "@/server/voice-bridge-reservation.server";
import { isVoiceAudioLeg } from "@/server/voice-audio-classification.server";
import { logger } from "@/lib/logger.server";

function required(value: string | null | undefined, field: string) {
  if (!value) throw new Error(`Missing ${field}`);
  return value;
}

async function endParticipantConference(client: Twilio.Twilio, conferenceName: string, verifiedConferenceSid?: string) {
  if (verifiedConferenceSid) {
    const conference = await client.conferences(verifiedConferenceSid).fetch();
    if (conference.sid !== verifiedConferenceSid || conference.accountSid !== client.accountSid || conference.friendlyName !== conferenceName)
      throw new Error("Conference does not match the current audio participant");
    if (conference.status !== "completed") await client.conferences(verifiedConferenceSid).update({ status: "completed" });
    return;
  }
  const conferences = await client.conferences.list({ friendlyName: conferenceName, status: "in-progress" });
  await Promise.all(conferences.map(({ sid }) => client.conferences(sid).update({ status: "completed" })));
}

/** Participant end cannot take the ordinary call-status billing or outcome claim. */
export async function handleConferenceParticipantHangup(event: ParticipantLeaveEvent, dbCall: Pick<Tables<"call">, "sid" | "workspace" | "contact_id" | "conference_id">, client: Twilio.Twilio, verifiedConferenceSid?: string) {
  const callSid = required(event.callSid, "CallSid"), workspaceId = required(dbCall.workspace, "workspace");
  let conferenceName = event.conferenceName ?? dbCall.conference_id;
  if (!conferenceName && event.conferenceSid) conferenceName = (await client.conferences(event.conferenceSid).fetch()).friendlyName;
  const name = required(conferenceName, "conference name");
  await endParticipantConference(client, name, verifiedConferenceSid);
  await emitPredictiveBroadcast(workspaceId, { contact_id: dbCall.contact_id, status: "completed", conference_id: name, conference_ended: true });
  try {
    const update: Partial<Tables<"call">> = {};
    if (event.timestamp) {
      const endedAt = new Date(event.timestamp);
      if (Number.isFinite(endedAt.getTime())) update.end_time = endedAt;
    }
    const funded = await findVoiceReservationForCall(workspaceId, callSid);
    if (!funded && event.durationSeconds !== null && !await isVoiceAudioLeg(workspaceId, callSid)) update.duration = String(event.durationSeconds);
    if (Object.keys(update).length) {
      const saved = await updateCallBySid(workspaceId, callSid, update);
      if (!saved) throw new Error("Participant call metadata not found");
    }
  } catch (error) { logger.error("Participant conference stopped but call metadata update failed", error); }
}

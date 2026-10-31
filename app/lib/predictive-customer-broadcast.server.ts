import type { Tables } from "@/lib/db-types";
import type { PredictiveBroadcastPayload } from "@/lib/workspace-events.shared";
import type { ParticipantJoinEvent, ParticipantLeaveEvent } from "@/lib/twilio/voice-callback";

type CustomerCall = Pick<Tables<"call">, "sid" | "workspace" | "user_id" | "campaign_id" | "contact_id" | "outreach_attempt_id" | "conference_id"> & { humanRevision?: string };
type Participation = { kind: "joined" | "left"; conferenceSid: string; sequence: number };

export function predictiveCustomerBroadcast(call: CustomerCall, status: string, participation?: Participation): PredictiveBroadcastPayload | null {
  if (!call.sid || !call.workspace || !call.user_id || !call.campaign_id || !call.contact_id || !call.outreach_attempt_id || !call.conference_id) return null;
  return { contact_id: call.contact_id, status, call_sid: call.sid, user_id: call.user_id,
    campaign_id: call.campaign_id, outreach_attempt_id: call.outreach_attempt_id, conference_id: call.conference_id,
    ...(call.humanRevision ? { human_revision: call.humanRevision } : {}),
    ...(participation ? { customer_event: participation.kind, conference_sid: participation.conferenceSid, conference_sequence: participation.sequence } : {}) };
}

export function predictiveCustomerParticipation(event: ParticipantJoinEvent | ParticipantLeaveEvent) {
  const raw = event.raw.SequenceNumber;
  if (!event.conferenceSid || !raw || !/^\d+$/.test(raw)) return null;
  const sequence = Number(raw);
  const kind = event.event === "participant-join" ? "joined" as const : "left" as const;
  return Number.isSafeInteger(sequence) ? { kind, conferenceSid: event.conferenceSid, sequence } : null;
}

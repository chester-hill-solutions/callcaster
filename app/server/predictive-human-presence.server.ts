import { and, eq } from "drizzle-orm";
import { call, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { isTerminalStatus, normalizeProviderStatus } from "@/lib/call-status";
import type { ParticipantJoinEvent, ParticipantLeaveEvent } from "@/lib/twilio/voice-callback";
import { predictiveCustomerParticipation } from "@/lib/predictive-customer-broadcast.server";
import { findBusyPredictiveHuman, matchesFundedHumanCall } from "./predictive-human-admission.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { db } from "./db";

/** Conference ordering is separate from provider Call progress and final billing. */
function matchesHumanEvent(owner: VoiceReservation, event: ParticipantJoinEvent | ParticipantLeaveEvent) {
  return owner.user_id && owner.kind === "staffed" && owner.provider_sid === event.callSid && owner.account_sid === event.accountSid &&
    owner.conference_id === event.conferenceRef && event.conferenceSid &&
    (!owner.conference_sid || owner.conference_sid === event.conferenceSid) &&
    !["left", "ended", "refused"].includes(owner.human_state ?? "");
}

export async function observePredictiveHumanPresence(tx: CreditTransaction, owner: VoiceReservation, event: ParticipantJoinEvent | ParticipantLeaveEvent) {
  const participation = predictiveCustomerParticipation(event), joining = event.event === "participant-join";
  if (!owner.user_id || !matchesHumanEvent(owner, event)) return false;
  // Historical joins without sequence may retain answer facts. They cannot release an owner.
  if (!participation && (!joining || owner.human_conference_sequence != null)) return false;
  if (participation && owner.human_conference_sequence != null &&
    (participation.sequence < owner.human_conference_sequence || !joining && participation.sequence === owner.human_conference_sequence)) return false;
  if (joining && await findBusyPredictiveHuman(tx, owner.workspace, owner.user_id, owner.id)) return false;
  if (!joining && !["pending", "joined"].includes(owner.human_state ?? "")) return false;
  await tx.update(reservations).set({ human_state: joining ? "joined" : "left",
    human_conference_sequence: participation?.sequence ?? null, conference_sid: event.conferenceSid, updated_at: new Date(),
  }).where(eq(reservations.id, owner.id));
  return true;
}

/** A rejected or old customer's leave cannot release the current human or end the room. */
export async function recordFundedPredictiveLeave(owner: VoiceReservation, event: ParticipantLeaveEvent) {
  return db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [current] = await tx.select().from(reservations).where(and(eq(reservations.id, owner.id), eq(reservations.workspace, owner.workspace))).for("update");
    if (!current || ["released", "settled"].includes(current.state) || current.terminal_status || !current.provider_sid) return null;
    const [customer] = await tx.select().from(call).where(and(eq(call.workspace, owner.workspace), eq(call.sid, current.provider_sid))).for("update");
    if (!customer || !matchesFundedHumanCall(customer, current) || isTerminalStatus(normalizeProviderStatus(customer.status))) return null;
    return await observePredictiveHumanPresence(tx, current, event) ? customer : null;
  });
}

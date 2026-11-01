import { and, eq, isNull, or, sql } from "drizzle-orm";
import { campaign, campaign_queue, workspace, workspace_voice_reservation as reservations, workspace_voice_audio_connection as audioConnections } from "@/db/schema";
import { db } from "@/server/db";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";
import { checkSchedule } from "@/lib/database/campaign.server";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { persistVoiceAudioCall } from "./voice-audio-call-record.server";
import { voiceAudioParticipantLabel, voiceAudioStartsMuted } from "@/lib/voice-audio-connection";
import { dialerReservationIsStopped } from "./voice-dialer-intent.server";

type ConferenceBindingInput = {
  reservationId: string; requestUrl: string; accountSid: string; callSid: string; conferenceId: string; conferenceSid: string;
  event?: string; participantLabel?: string; muted?: string;
};

function matchesAudioParticipant(row: typeof audioConnections.$inferSelect, input: ConferenceBindingInput) {
  if (!row.voice_issued_at || row.conference_callback !== input.requestUrl || row.conference_sid && row.conference_sid !== input.conferenceSid ||
    input.participantLabel !== voiceAudioParticipantLabel(row)) return false;
  if (input.event !== "participant-join" || row.joined_at || row.state === "active") return true;
  return input.muted === String(voiceAudioStartsMuted(row));
}

/** Twilio sends all conference events to the first participant's callback URL. */
export function predictiveConferenceCallbackUrl(reservation: VoiceReservation) {
  if (!reservation.conference_id || !reservation.status_callback) throw new Error("Predictive conference context missing");
  const url = new URL(reservation.status_callback);
  url.searchParams.delete("credit_leg");
  url.searchParams.set("conference_events", "1");
  return url.href;
}

/** Provider authentication must precede this conference-scoped binding. */
export async function bindPredictiveConferenceEvent(input: ConferenceBindingInput) {
  if (!/^[0-9a-f-]{36}$/i.test(input.reservationId) || !/^CF[0-9a-f]{32}$/i.test(input.conferenceSid))
    throw new Error("Invalid predictive conference event identity");
  return db.transaction(async (tx) => {
    const [owner] = await tx.select().from(reservations).where(eq(reservations.id, input.reservationId)).for("update");
    if (!owner?.conference_id || owner.account_sid !== input.accountSid || owner.conference_id !== input.conferenceId ||
        predictiveConferenceCallbackUrl(owner) !== input.requestUrl || owner.conference_sid && owner.conference_sid !== input.conferenceSid)
      throw new Error("Predictive conference event does not match its owner");
    const [reservation] = await tx.update(reservations).set({ conference_sid: input.conferenceSid, updated_at: new Date() })
      .where(eq(reservations.id, owner.id)).returning();
    if (!reservation) throw new Error("Predictive conference event was not saved");
    const [audio] = await tx.select().from(audioConnections).where(and(
      eq(audioConnections.workspace, owner.workspace), eq(audioConnections.account_sid, owner.account_sid),
      eq(audioConnections.conference_id, owner.conference_id), eq(audioConnections.provider_sid, input.callSid),
    )).limit(1);
    if (audio) {
      if (!matchesAudioParticipant(audio, input))
        throw new Error("Predictive audio participant does not match its join");
      return { reservation, call: await persistVoiceAudioCall(tx, audio), setup: false, audio };
    }
    const [participant] = await tx.select().from(reservations).where(and(
      eq(reservations.workspace, owner.workspace), eq(reservations.account_sid, owner.account_sid),
      eq(reservations.conference_id, owner.conference_id),
      or(eq(reservations.provider_sid, input.callSid), eq(reservations.setup_sid, input.callSid)),
    )).limit(1);
    if (!participant) throw new Error("Predictive conference participant is not funded");
    const setup = participant.setup_sid === input.callSid;
    const call = await persistReservedVoiceCall(tx, participant, input.callSid, setup ? "setup" : "recipient");
    return { reservation, call, setup, audio: null };
  });
}

/** The initial recipient has already been claimed and funded before agent setup. */
function isUncalledSetup(row: VoiceReservation | undefined, setupSid: string): row is VoiceReservation {
  return Boolean(row && row.conference_id && row.setup_sid === setupSid && row.conference_sid && row.state === "creating" &&
    !row.provider_sid && !row.recipient_instruction_issued_at && !row.recipient_refused_at && !row.setup_terminal_at);
}

export async function claimFirstPredictiveRecipient(reservation: VoiceReservation, setupSid: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, reservation.workspace)).for("no key update");
    const [current] = await tx.select().from(reservations).where(and(
      eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
    )).for("update");
    if (!isUncalledSetup(current, setupSid)) return null;
    if (await dialerReservationIsStopped(tx, current))
      return { send: false as const, reservation: await refuseRecipient(tx, current, "Captured dialer Stop blocks the first customer") };
    const [savedCampaign] = await tx.select().from(campaign).where(and(
      eq(campaign.id, current.campaign_id ?? 0), eq(campaign.workspace, current.workspace),
    )).for("update");
    if (!savedCampaign || savedCampaign.status !== "running" || !checkSchedule(savedCampaign)) {
      return { send: false as const, reservation: await refuseRecipient(tx, current, "Campaign is not running when agent joined") };
    }
    const [queue] = await tx.select({ id: campaign_queue.id }).from(campaign_queue).where(and(
      eq(campaign_queue.id, current.queue_id ?? 0), eq(campaign_queue.workspace, current.workspace),
      eq(campaign_queue.dispatch_generation, current.queue_generation ?? ""), eq(campaign_queue.voice_reservation_id, current.id),
      isNull(campaign_queue.dequeued_at), eq(campaign_queue.queue_state, "assigned"),
      eq(campaign_queue.assigned_to_user_id, current.user_id ?? ""),
    )).for("update");
    if (!queue) return { send: false as const, reservation: await refuseRecipient(tx, current, "Funded queue claim changed before agent joined") };
    if (!recipientCallingWindowStatus(current.recipient).allowed) {
      return { send: false as const, reservation: await refuseRecipient(tx, current, "Recipient calling window closed before agent joined") };
    }
    const [issued] = await tx.update(reservations).set({ recipient_instruction_issued_at: sql`clock_timestamp()`,
      lease_expires_at: new Date(Date.now() + 5 * 60_000), updated_at: new Date(),
    }).where(eq(reservations.id, current.id)).returning();
    if (!issued) throw new Error("First predictive recipient checkpoint was not saved");
    return { send: true as const, reservation: issued };
  });
}

async function refuseRecipient(tx: CreditTransaction, current: VoiceReservation, reason: string) {
  const [saved] = await tx.update(reservations).set({ recipient_refused_at: sql`clock_timestamp()`, last_error: reason,
    lease_expires_at: new Date(), updated_at: new Date(),
  }).where(eq(reservations.id, current.id)).returning();
  if (!saved) throw new Error("Predictive recipient refusal was not saved");
  return saved;
}

/** Positive provider rejection keeps setup funding until its terminal observation. */
export async function refuseFirstPredictiveRecipient(reservation: VoiceReservation) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reservations).where(and(eq(reservations.id, reservation.id),
      eq(reservations.workspace, reservation.workspace), eq(reservations.lease_token, reservation.lease_token),
    )).for("update");
    if (!current?.conference_id || !current.setup_sid || current.provider_sid || !current.recipient_instruction_issued_at)
      throw new Error("Predictive recipient rejection has no owned send");
    return refuseRecipient(tx, current, "Provider rejected first predictive recipient; setup must stop");
  });
}

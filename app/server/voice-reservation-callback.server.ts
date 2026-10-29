import { and, eq } from "drizzle-orm";
import { call, campaign, campaign_queue, contact, outreach_attempt, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export async function persistReservedVoiceCall(tx: CreditTransaction, reservation: VoiceReservation, callSid: string) {
  // Customer data can be removed after the provider accepts a call. Keep its
  // billing identity, and lock only surviving tenant links through insertion.
  const [campaignRow] = reservation.campaign_id == null ? [] : await tx.select({ id: campaign.id }).from(campaign).where(and(
    eq(campaign.id, reservation.campaign_id), eq(campaign.workspace, reservation.workspace),
  )).for("key share");
  const [contactRow] = reservation.contact_id == null ? [] : await tx.select({ id: contact.id }).from(contact).where(and(
    eq(contact.id, reservation.contact_id), eq(contact.workspace, reservation.workspace),
  )).for("key share");
  const [attemptRow] = reservation.outreach_attempt_id == null ? [] : await tx.select({ id: outreach_attempt.id }).from(outreach_attempt).where(and(
    eq(outreach_attempt.id, reservation.outreach_attempt_id), eq(outreach_attempt.workspace, reservation.workspace),
  )).for("key share");
  const [queueRow] = reservation.queue_id == null ? [] : await tx.select({ id: campaign_queue.id }).from(campaign_queue).where(and(
    eq(campaign_queue.id, reservation.queue_id), eq(campaign_queue.workspace, reservation.workspace),
  )).for("key share");
  await tx.insert(call).values({
    sid: callSid, workspace: reservation.workspace, account_sid: reservation.account_sid,
    to: reservation.recipient, from: reservation.caller_id,
    parent_call_sid: reservation.setup_sid, campaign_id: campaignRow?.id ?? null,
    contact_id: contactRow?.id ?? null, outreach_attempt_id: attemptRow?.id ?? null,
    user_id: reservation.user_id, status: "initiated", direction: "outbound-api",
    queue_id: queueRow?.id ?? null,
  }).onConflictDoNothing({ target: call.sid });
  const [saved] = await tx.select().from(call).where(and(eq(call.sid, callSid), eq(call.workspace, reservation.workspace)));
  if (!saved || (saved.account_sid && saved.account_sid !== reservation.account_sid)) {
    throw new Error("Voice call belongs to a different dispatch");
  }
  return saved;
}

/** Call only after validating the provider signature, including the URL query. */
export async function bindVoiceReservationCallback(args: {
  reservationId: string;
  accountSid: string;
  callSid: string;
  to: string;
  direction: string;
  requestUrl: string;
  entryPoint: "voice" | "status";
  parentCallSid?: string | null;
}) {
  if (!/^[0-9a-f-]{36}$/i.test(args.reservationId) || !/^CA[0-9a-f]{32}$/i.test(args.callSid)) {
    throw new Error("Invalid voice reservation callback identity");
  }
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(reservations)
      .where(eq(reservations.id, args.reservationId)).for("update");
    if (!reservation || !reservation.send_started_at || reservation.state === "released" ||
        reservation.account_sid !== args.accountSid || reservation.recipient !== args.to ||
        args.direction !== (reservation.setup_sid ? "outbound-dial" : "outbound-api") ||
        (args.entryPoint === "voice" ? reservation.voice_url : reservation.status_callback) !== args.requestUrl ||
        (reservation.provider_sid && reservation.provider_sid !== args.callSid) ||
        (reservation.setup_sid ?? null) !== (args.parentCallSid || null)) {
      throw new Error("Voice reservation callback does not match its dispatch");
    }
    const saved = await persistReservedVoiceCall(tx, reservation, args.callSid);
    await tx.update(reservations).set({
      provider_sid: args.callSid,
      state: reservation.state === "settled" ? "settled" : "active", updated_at: new Date(),
    }).where(eq(reservations.id, reservation.id));
    return saved;
  });
}

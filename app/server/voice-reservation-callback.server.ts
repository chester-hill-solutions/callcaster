import { and, eq } from "drizzle-orm";
import { call, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export async function persistReservedVoiceCall(tx: CreditTransaction, reservation: VoiceReservation, callSid: string) {
  await tx.insert(call).values({
    sid: callSid, workspace: reservation.workspace, account_sid: reservation.account_sid,
    to: reservation.recipient, from: reservation.caller_id,
    parent_call_sid: reservation.setup_sid, campaign_id: reservation.campaign_id,
    contact_id: reservation.contact_id, outreach_attempt_id: reservation.outreach_attempt_id,
    user_id: reservation.user_id, status: "initiated", direction: "outbound-api",
    queue_id: reservation.queue_id,
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

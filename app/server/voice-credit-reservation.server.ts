import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { voiceCreditsFromDurationSeconds, type VoiceBillingKind } from "@/lib/pricing";
import { ACTIVE_VOICE_RESERVATION_STATES, getOutboundHeldCredits } from "./outbound-credit-reservations.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";

export type VoiceReservation = typeof reservations.$inferSelect;
const LEASE_MS = 5 * 60_000;

function owned(reservation: VoiceReservation) {
  return and(
    eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
    eq(reservations.lease_token, reservation.lease_token),
    inArray(reservations.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
  );
}

export async function reserveVoiceCredits(args: {
  workspaceId: string;
  kind: VoiceBillingKind;
  accountSid: string;
  to: string;
  from: string;
  campaignId?: number | null;
  contactId?: number | null;
  outreachAttemptId?: number | null;
  userId?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [balance] = await tx.select({ credits: workspace.credits }).from(workspace)
      .where(eq(workspace.id, args.workspaceId)).for("update");
    if (!balance) return { ok: false as const, reason: "workspace_not_found" as const };
    const available = balance.credits - await getOutboundHeldCredits(tx, args.workspaceId);
    const credits = voiceCreditsFromDurationSeconds(1, args.kind);
    if (available < credits) return { ok: false as const, reason: "insufficient_credits" as const, balance: available };
    const [reservation] = await tx.insert(reservations).values({
      id: randomUUID(), workspace: args.workspaceId, kind: args.kind, credits,
      account_sid: args.accountSid, recipient: args.to, caller_id: args.from,
      campaign_id: args.campaignId, contact_id: args.contactId,
      outreach_attempt_id: args.outreachAttemptId, user_id: args.userId,
      lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS),
    }).returning();
    if (!reservation) throw new Error("Voice credit reservation was not saved");
    return { ok: true as const, reservation };
  });
}

/** The committed checkpoint permits one provider POST for this owner. */
export async function startVoiceReservation(reservation: VoiceReservation) {
  const [row] = await db.update(reservations).set({
    state: "creating", send_started_at: new Date(), updated_at: new Date(),
  }).where(and(owned(reservation), eq(reservations.state, "reserved"),
    gt(reservations.lease_expires_at, new Date()))).returning();
  if (!row) throw new Error("Voice credit reservation is no longer owned");
  return row;
}

export async function recordVoiceReservationProvider(reservation: VoiceReservation, callSid: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reservations).where(and(
      eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
      eq(reservations.lease_token, reservation.lease_token),
    )).for("update");
    if (!row || !row.send_started_at || row.state === "released" || (row.provider_sid && row.provider_sid !== callSid)) {
      throw new Error("Voice credit reservation is no longer owned");
    }
    if (row.provider_sid === callSid) return row;
    await persistReservedVoiceCall(tx, row, callSid);
    const [saved] = await tx.update(reservations).set({ provider_sid: callSid, state: "active", updated_at: new Date() })
      .where(eq(reservations.id, row.id)).returning();
    return saved;
  });
}

/** Only a confirmed rejection or a never-started owner can release without a callback. */
export async function releaseUnsentVoiceReservation(reservation: VoiceReservation, evidence: "not_sent" | "rejected") {
  const [row] = await db.update(reservations).set({ state: "released", updated_at: new Date(), last_error: null })
    .where(and(owned(reservation), isNull(reservations.provider_sid), isNull(reservations.setup_sid),
      eq(reservations.state, evidence === "not_sent" ? "reserved" : "creating"))).returning();
  return row;
}

export async function deferVoiceReservation(reservation: VoiceReservation, message: string) {
  await db.update(reservations).set({ last_error: message, updated_at: new Date(), lease_expires_at: new Date() })
    .where(owned(reservation));
}

export async function claimVoiceReservationRecovery(limit = 25) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(reservations).where(and(
      inArray(reservations.state, [...ACTIVE_VOICE_RESERVATION_STATES]), lt(reservations.lease_expires_at, new Date()),
    )).orderBy(reservations.lease_expires_at).limit(limit).for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx.update(reservations).set({ lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS) })
      .where(inArray(reservations.id, rows.map((row) => row.id))).returning();
  });
}

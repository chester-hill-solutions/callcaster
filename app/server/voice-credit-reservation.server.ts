import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { campaign_queue, workspace, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { voiceCreditsFromDurationSeconds, type VoiceBillingKind } from "@/lib/pricing";
import { ACTIVE_VOICE_RESERVATION_STATES, getOutboundHeldCredits, type CreditTransaction } from "./outbound-credit-reservations.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";

export type VoiceReservation = typeof reservations.$inferSelect;
export type VoiceDispatchUrls = { voiceUrl: string; statusCallback: string };
const LEASE_MS = 5 * 60_000;

function owned(reservation: VoiceReservation) {
  return and(
    eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
    eq(reservations.lease_token, reservation.lease_token),
    inArray(reservations.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
  );
}

export type VoiceReservationInput = {
  workspaceId: string;
  kind: VoiceBillingKind;
  accountSid: string;
  to: string;
  from: string;
  campaignId?: number | null;
  contactId?: number | null;
  outreachAttemptId?: number | null;
  queueId?: number | null;
  expectedQueueGeneration?: string;
  operationKey?: string;
  userId?: string | null;
  setupTo?: string | null;
  /** Runs database work only, after funding succeeds and inside its transaction. */
  prepareOutreach?: (tx: CreditTransaction) => Promise<number>;
};

async function resolveQueueOperation(tx: CreditTransaction, args: VoiceReservationInput) {
  if (args.queueId == null) {
    return { ok: true as const, operationKey: args.operationKey, queueGeneration: null, queued: true };
  }
  if (args.campaignId == null || args.contactId == null) return { ok: false as const, reason: "queue_not_found" as const };
  const [queue] = await tx.select().from(campaign_queue).where(and(
    eq(campaign_queue.id, args.queueId), eq(campaign_queue.workspace, args.workspaceId),
    eq(campaign_queue.campaign_id, args.campaignId), eq(campaign_queue.contact_id, args.contactId),
  )).for("no key update");
  if (!queue) return { ok: false as const, reason: "queue_not_found" as const };
  if (args.expectedQueueGeneration !== undefined && args.expectedQueueGeneration !== queue.dispatch_generation) {
    return { ok: false as const, reason: "queue_not_queued" as const };
  }
  return {
    ok: true as const, queueGeneration: queue.dispatch_generation,
    operationKey: args.setupTo ? args.operationKey : args.operationKey ? `${args.operationKey}:${queue.dispatch_generation}` : undefined,
    queued: queue.dequeued_at === null && (queue.queue_state === null || ["queued", "assigned"].includes(queue.queue_state)),
  };
}

type VoiceIntentInput = Pick<VoiceReservationInput,
  "workspaceId" | "to" | "from" | "campaignId" | "contactId" | "queueId" | "userId" | "setupTo" | "outreachAttemptId" | "operationKey">;

function sameVoiceContext(existing: VoiceReservation, args: VoiceIntentInput) {
  return existing.campaign_id === (args.campaignId ?? null) && existing.contact_id === (args.contactId ?? null) &&
    existing.queue_id === (args.queueId ?? null) && existing.user_id === (args.userId ?? null) &&
    existing.setup_to === (args.setupTo ?? null) && existing.requested_outreach_attempt_id === (args.outreachAttemptId ?? null);
}

async function findRepeatedOperation(tx: CreditTransaction, args: VoiceIntentInput & { accountSid?: string }, operationKey: string | undefined) {
  if (!operationKey) return null;
  const [existing] = await tx.select().from(reservations).where(and(
    eq(reservations.workspace, args.workspaceId), eq(reservations.operation_key, operationKey),
    or(ne(reservations.state, "released"), isNotNull(reservations.setup_sid), isNotNull(reservations.provider_sid)),
  )).limit(1);
  if (!existing) return null;
  const sameRequest = (args.accountSid === undefined || existing.account_sid === args.accountSid) &&
    existing.recipient === args.to && existing.caller_id === args.from && sameVoiceContext(existing, args);
  const acceptedSid = existing.setup_sid ?? existing.provider_sid;
  if (!acceptedSid || !sameRequest) return { ok: false as const, reason: "dispatch_in_progress" as const };
  if (existing.provider_sid) await persistReservedVoiceCall(tx, existing, existing.provider_sid);
  else await persistReservedVoiceCall(tx, existing, acceptedSid, "setup");
  return { ok: false as const, reason: "already_dispatched" as const, callSid: acceptedSid, queueGeneration: existing.queue_generation };
}

/** The route must authorize the workspace and actor before this lookup. */
export async function replayVoiceOperation(args: VoiceIntentInput) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, args.workspaceId)).for("no key update");
    return findRepeatedOperation(tx, args, args.operationKey);
  });
}

export async function reserveVoiceCredits(args: VoiceReservationInput) {
  return db.transaction(async (tx) => {
    const [balance] = await tx.select({ credits: workspace.credits }).from(workspace)
      .where(eq(workspace.id, args.workspaceId)).for("no key update");
    if (!balance) return { ok: false as const, reason: "workspace_not_found" as const };
    if (args.setupTo) {
      const replay = await findRepeatedOperation(tx, args, args.operationKey);
      if (replay) return replay;
    }
    const queue = await resolveQueueOperation(tx, args);
    if (!queue.ok) return queue;
    const replay = await findRepeatedOperation(tx, args, queue.operationKey);
    if (replay) return replay;
    if (!queue.queued) return { ok: false as const, reason: "queue_not_queued" as const };
    if (args.queueId != null) {
      const [pending] = await tx.select({ id: reservations.id }).from(reservations).where(and(
        eq(reservations.workspace, args.workspaceId), eq(reservations.queue_id, args.queueId),
        inArray(reservations.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
      )).limit(1);
      if (pending) return { ok: false as const, reason: "dispatch_in_progress" as const };
    }
    const available = balance.credits - await getOutboundHeldCredits(tx, args.workspaceId);
    const credits = voiceCreditsFromDurationSeconds(1, args.kind);
    if (available < credits) return { ok: false as const, reason: "insufficient_credits" as const, balance: available };
    const outreachAttemptId = args.prepareOutreach ? await args.prepareOutreach(tx) : args.outreachAttemptId;
    const [reservation] = await tx.insert(reservations).values({
      id: randomUUID(), workspace: args.workspaceId, kind: args.kind, credits,
      account_sid: args.accountSid, recipient: args.to, caller_id: args.from,
      campaign_id: args.campaignId, contact_id: args.contactId,
      outreach_attempt_id: outreachAttemptId, queue_id: args.queueId, queue_generation: queue.queueGeneration,
      requested_outreach_attempt_id: args.outreachAttemptId,
      operation_key: queue.operationKey, user_id: args.userId, setup_to: args.setupTo,
      lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS),
      // Admission may wait for a workspace lock. Record the real insertion
      // time, not the transaction start, for explicit-redial duplicate checks.
      created_at: sql`clock_timestamp()`,
    }).returning();
    if (!reservation) throw new Error("Voice credit reservation was not saved");
    if (args.queueId != null) await tx.update(campaign_queue).set({ voice_reservation_id: reservation.id }).where(and(
      eq(campaign_queue.id, args.queueId), eq(campaign_queue.workspace, args.workspaceId),
    ));
    return { ok: true as const, reservation };
  });
}

/** The committed checkpoint permits one provider POST for this owner. */
export async function startVoiceReservation(reservation: VoiceReservation, urls: VoiceDispatchUrls) {
  const [row] = await db.update(reservations).set({
    state: "creating", send_started_at: new Date(), updated_at: new Date(),
    voice_url: urls.voiceUrl, status_callback: urls.statusCallback,
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
    await persistReservedVoiceCall(tx, row, callSid);
    if (row.provider_sid === callSid) return row;
    const [saved] = await tx.update(reservations).set({ provider_sid: callSid, state: "active", updated_at: new Date() })
      .where(eq(reservations.id, row.id)).returning();
    return saved;
  });
}

/** The owner must prove no POST was made, or that the provider rejected it. */
export async function releaseUnsentVoiceReservation(reservation: VoiceReservation, evidence: "not_sent" | "rejected") {
  const [row] = await db.update(reservations).set({ state: "released", updated_at: new Date(), last_error: null })
    .where(and(owned(reservation), isNull(reservations.provider_sid), isNull(reservations.setup_sid),
      inArray(reservations.state, evidence === "not_sent" ? ["reserved", "creating"] : ["creating"]))).returning();
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

/** A verified terminal receipt can identify a call before its duration is ready. */
export async function requestVoiceReservationRecovery(reservationId: string) {
  await db.update(reservations).set({ lease_expires_at: new Date(), last_error: "Final call duration is not available" }).where(and(
    eq(reservations.id, reservationId), inArray(reservations.state, [...ACTIVE_VOICE_RESERVATION_STATES]),
  ));
}

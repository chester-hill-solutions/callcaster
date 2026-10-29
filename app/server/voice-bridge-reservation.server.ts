import { and, eq, gt, inArray, isNull, notInArray, notExists, or, sql } from "drizzle-orm";
import { call, campaign_queue, workspace_voice_audio_connection as audioConnections, workspace_voice_reservation as reservations } from "@/db/schema";
import { db } from "@/server/db";
import { normalizeProviderStatus, isTerminalStatus } from "@/lib/call-status";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";
import { logger } from "@/lib/logger.server";
import type { DeferredEmit } from "@/lib/campaign-queue-db.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";
import { hasVoiceSetup, matchesVoiceSetupRoot } from "@/lib/voice-bridge-identity";

export type VoiceBridgeUrls = { voiceUrl: string; statusCallback: string; recipientStatusCallback: string; recipientVoiceUrl?: string };
const TERMINAL = ["completed", "failed", "busy", "no-answer", "canceled"];

export async function startVoiceBridgeReservation(reservation: VoiceReservation, urls: VoiceBridgeUrls) {
  return startVoiceBridgeReservationInTransaction(db, reservation, urls);
}

export async function startVoiceBridgeReservationInTransaction(
  executor: Pick<CreditTransaction, "update">, reservation: VoiceReservation, urls: VoiceBridgeUrls,
) {
  const [row] = await executor.update(reservations).set({
    state: "creating", send_started_at: new Date(), updated_at: new Date(),
    setup_voice_url: urls.voiceUrl, setup_status_callback: urls.statusCallback, status_callback: urls.recipientStatusCallback,
    voice_url: urls.recipientVoiceUrl,
  }).where(and(
    eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
    eq(reservations.lease_token, reservation.lease_token), eq(reservations.state, "reserved"),
    gt(reservations.lease_expires_at, new Date()), eq(reservations.kind, "staffed"),
  )).returning();
  if (!row || !hasVoiceSetup(row)) throw new Error("Voice bridge reservation is no longer owned");
  return row;
}

export async function recordVoiceBridgeSetupProvider(reservation: VoiceReservation, callSid: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(reservations).where(and(
      eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
    )).for("update");
    if (!row || !hasVoiceSetup(row) || !row.send_started_at || (row.setup_sid && row.setup_sid !== callSid)) {
      throw new Error("Voice bridge setup does not match its dispatch");
    }
    if (row.setup_sid !== callSid && (row.lease_token !== reservation.lease_token || row.state !== "creating")) {
      throw new Error("Voice bridge reservation is no longer owned");
    }
    const [saved] = await tx.update(reservations).set({ setup_sid: callSid, updated_at: new Date() })
      .where(eq(reservations.id, row.id)).returning();
    if (!saved) throw new Error("Voice setup acknowledgement was not saved");
    try {
      await tx.transaction((savepoint) => persistReservedVoiceCall(savepoint, saved, callSid, "setup"));
    } catch (error) {
      // A local record fault cannot undo the provider's acceptance. Keep the
      // SID before allowing recovery to repair the call row.
      await tx.update(reservations).set({ last_error: "Manual setup call record needs recovery", lease_expires_at: new Date() })
        .where(eq(reservations.id, row.id));
      logger.error("voice_credit.setup_record_pending", error);
    }
    return saved;
  });
}

export type VoiceBridgeSetupCallback = {
  reservationId: string; accountSid: string; callSid: string; to: string; from: string;
  direction: string; parentCallSid?: string | null; requestUrl: string; entryPoint: "voice" | "status";
  status?: string;
};

function matchesSetup(row: VoiceReservation, args: VoiceBridgeSetupCallback) {
  return !row.setup_client_identity && row.setup_to && row.send_started_at && row.account_sid === args.accountSid &&
    row.setup_to === args.to && row.caller_id === args.from && args.direction === "outbound-api" &&
    !args.parentCallSid && (row.setup_sid === null || row.setup_sid === args.callSid) &&
    (args.entryPoint === "voice" ? row.setup_voice_url : row.setup_status_callback) === args.requestUrl;
}

async function saveSetupStatus(tx: CreditTransaction, row: VoiceReservation, callSid: string, rawStatus: string, deferEmit: DeferredEmit) {
  const status = normalizeProviderStatus(rawStatus);
  if (!status) throw new Error("Invalid voice setup status");
  await tx.update(call).set({ status, date_updated: new Date() }).where(and(
    eq(call.sid, callSid), eq(call.workspace, row.workspace), or(isNull(call.status), notInArray(call.status, TERMINAL)),
  ));
  if (!isTerminalStatus(status)) return row;
  const [saved] = await tx.update(reservations).set({
    setup_terminal_at: sql`coalesce(${reservations.setup_terminal_at}, clock_timestamp())`,
    setup_terminal_status: sql`coalesce(${reservations.setup_terminal_status}, ${status})`,
    state: (!row.recipient_instruction_issued_at || row.recipient_refused_at) && !row.provider_sid ? "released" : row.state,
    updated_at: new Date(),
  }).where(eq(reservations.id, row.id)).returning();
  if (!saved) throw new Error("Voice setup status was not saved");
  if (saved.conference_id && saved.state === "released" && saved.queue_id && saved.queue_generation) {
    await requeueCampaignQueueById(saved.queue_id, saved.workspace, { exec: tx, deferEmit, expectedGeneration: saved.queue_generation,
      userId: saved.user_id ?? undefined, voiceReservationId: saved.id });
  }
  return saved;
}

async function bindSetup(tx: CreditTransaction, args: VoiceBridgeSetupCallback, deferEmit: DeferredEmit) {
  if (!/^[0-9a-f-]{36}$/i.test(args.reservationId) || !/^CA[0-9a-f]{32}$/i.test(args.callSid)) {
    throw new Error("Invalid voice setup callback identity");
  }
  const [row] = await tx.select().from(reservations).where(eq(reservations.id, args.reservationId)).for("update");
  if (!row || !matchesSetup(row, args) || (row.state === "released" && row.setup_sid !== args.callSid)) {
    throw new Error("Voice setup callback does not match its dispatch");
  }
  const root = await persistReservedVoiceCall(tx, row, args.callSid, "setup");
  const [bound] = await tx.update(reservations).set({ setup_sid: args.callSid, updated_at: new Date() })
    .where(eq(reservations.id, row.id)).returning();
  if (!bound) throw new Error("Voice setup callback was not saved");
  const status = args.entryPoint === "status" ? args.status : root.status;
  return { reservation: status ? await saveSetupStatus(tx, bound, args.callSid, status, deferEmit) : bound, root };
}

/** The caller must verify the provider signature before binding either URL. */
export async function bindVoiceBridgeSetupCallback(args: VoiceBridgeSetupCallback) {
  return setupTransaction((tx, deferEmit) => bindSetup(tx, args, deferEmit));
}

async function setupTransaction<T>(run: (tx: CreditTransaction, deferEmit: DeferredEmit) => Promise<T>) {
  const events: Array<() => Promise<void>> = [];
  const result = await db.transaction((tx) => run(tx, (emit) => events.push(emit)));
  for (const emit of events) {
    try { await emit(); } catch (error) { logger.error("voice_credit.setup_queue_event_failed", error); }
  }
  return result;
}

/** One committed instruction permits one customer leg, including early fetches. */
export async function claimVoiceBridgeRecipient(args: VoiceBridgeSetupCallback) {
  return setupTransaction(async (tx, deferEmit) => {
    const { reservation: row } = await bindSetup(tx, args, deferEmit);
    if (row.state === "released" || row.state === "settled" || row.setup_terminal_at || row.recipient_instruction_issued_at) {
      return { issued: false as const, reservation: row };
    }
    if (row.queue_id != null) {
      if (!row.queue_generation) return { issued: false as const, reservation: row };
      const [queue] = await tx.select({ id: campaign_queue.id }).from(campaign_queue).where(and(
        eq(campaign_queue.id, row.queue_id), eq(campaign_queue.workspace, row.workspace),
        eq(campaign_queue.dispatch_generation, row.queue_generation),
        eq(campaign_queue.voice_reservation_id, row.id), isNull(campaign_queue.dequeued_at),
        inArray(campaign_queue.queue_state, ["queued", "assigned"]),
      )).for("no key update");
      if (!queue) return { issued: false as const, reservation: row };
    }
    const [issued] = await tx.update(reservations).set({ recipient_instruction_issued_at: sql`clock_timestamp()`, updated_at: new Date() })
      .where(eq(reservations.id, row.id)).returning();
    if (!issued) throw new Error("Voice recipient instruction was not saved");
    return { issued: true as const, reservation: issued };
  });
}

/** A known original-account root can prove no child instruction was issued. */
export async function observeVoiceBridgeSetupStatus(reservation: VoiceReservation, root: {
  sid: string; accountSid: string; to: string; from: string; direction: string; status: string; parentCallSid: string | null;
}) {
  return setupTransaction(async (tx, deferEmit) => {
    const [row] = await tx.select().from(reservations).where(and(
      eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
      eq(reservations.lease_token, reservation.lease_token),
    )).for("update");
    if (!row || row.setup_sid !== root.sid || !matchesVoiceSetupRoot(row, root)) {
      throw new Error("Voice recovery setup does not match its dispatch");
    }
    await persistReservedVoiceCall(tx, row, root.sid, "setup");
    return saveSetupStatus(tx, row, root.sid, root.status, deferEmit);
  });
}

export async function findVoiceReservationForCall(workspaceId: string, callSid: string, parentCallSid?: string | null) {
  const [row] = await db.select().from(reservations).where(and(
    eq(reservations.workspace, workspaceId), or(eq(reservations.provider_sid, callSid), eq(reservations.setup_sid, callSid),
      parentCallSid ? eq(reservations.setup_sid, parentCallSid) : undefined),
  )).limit(1);
  return row ?? null;
}

/** Apply before a legacy recovery LIMIT, including children not yet bound. */
export function unreservedVoiceCallPredicate(workspaceId: string) {
  const customerFunding = notExists(db.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.workspace, workspaceId), or(eq(reservations.provider_sid, call.sid),
      eq(reservations.setup_sid, call.sid), eq(reservations.setup_sid, call.parent_call_sid)),
  )));
  const agentAudio = notExists(db.select({ id: audioConnections.id }).from(audioConnections).where(and(
    eq(audioConnections.workspace, workspaceId), eq(audioConnections.provider_sid, call.sid),
  )));
  return sql`${customerFunding} and ${agentAudio}`;
}

/** Use only after provider authentication; expose no cross-workspace metadata. */
export async function hasVoiceReservationCallBinding(callSid: string, parentCallSid?: string) {
  const [row] = await db.select({ id: reservations.id }).from(reservations).where(or(
    eq(reservations.provider_sid, callSid), eq(reservations.setup_sid, callSid),
    parentCallSid ? eq(reservations.setup_sid, parentCallSid) : undefined,
  )).limit(1);
  return Boolean(row);
}

export async function knownVoiceSetupSid(reservation: VoiceReservation) {
  const [row] = await db.select({ sid: reservations.setup_sid }).from(reservations).where(and(
    eq(reservations.id, reservation.id), eq(reservations.workspace, reservation.workspace),
  )).limit(1);
  return row?.sid ?? null;
}

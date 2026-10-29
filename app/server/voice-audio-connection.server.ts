import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { call, workspace, workspace_voice_audio_connection as connections } from "@/db/schema";
import { db } from "@/server/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { logger } from "@/lib/logger.server";
import { PENDING_VOICE_AUDIO_STATES, voiceAudioOperationUrl, voiceAudioRefusal, type VoiceAudioConnectionInput } from "@/lib/voice-audio-connection";
import { getOutboundHeldCredits, type CreditTransaction } from "./outbound-credit-reservations.server";
import { lockVoiceAudioActor, resolveVoiceAudioAdmission } from "./voice-audio-admission.server";

export type VoiceAudioConnection = typeof connections.$inferSelect;
const LEASE_MS = 5 * 60_000;

function pendingReplay(pending: VoiceAudioConnection, args: VoiceAudioConnectionInput, targetKey: string, accountSid: string) {
  return pending.target_key === targetKey && sameRequest(pending, args) && pending.account_sid === accountSid
    ? { ok: true as const, connection: pending, replayed: true } : voiceAudioRefusal("connection_pending");
}

async function lacksIdleCredits(tx: CreditTransaction, workspaceId: string, credits: number, targetKind: VoiceAudioConnection["target_kind"]) {
  return targetKind === "idle" && credits - await getOutboundHeldCredits(tx, workspaceId) <= 0;
}

function sameRequest(row: VoiceAudioConnection, args: VoiceAudioConnectionInput) {
  let destination = row.destination;
  if (args.transport === "phone") {
    try { destination = normalizePhoneNumber(args.phoneNumber ?? ""); } catch { return false; }
  }
  return row.transport === args.transport && row.destination === destination &&
    row.requested_call_sid === (args.callSid ?? null) &&
    (args.callSid ? args.campaignId == null && row.source_agent_sid === args.expectedAgentSid : row.campaign_id === (args.campaignId ?? null));
}

/** One actor lock serializes intent replay, pending replacement and generations. */
export async function prepareVoiceAudioConnection(args: VoiceAudioConnectionInput & { baseUrl: string }) {
  return db.transaction(async (tx) => {
    const actor = await lockVoiceAudioActor(tx, args);
    if (!actor.ok) return actor;
    const prior = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: and(
      eq(connections.user_id, args.userId), eq(connections.intent_id, args.intentId),
    ) });
    if (prior) return sameRequest(prior, args) ? { ok: true as const, connection: prior, replayed: true } : voiceAudioRefusal("intent_conflict");
    const current = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: and(
      eq(connections.user_id, args.userId), eq(connections.state, "active"),
    ) }) ?? null;
    // An idle legacy retry cannot ring an already connected phone again.
    if (current && !args.callSid && sameRequest(current, args)) return { ok: true as const, connection: current, replayed: true };
    const admission = await resolveVoiceAudioAdmission(actor, args, current);
    if (!admission.ok) return admission;
    const { target, destination, sourceSid } = admission;
    const pending = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: and(
      eq(connections.user_id, args.userId), inArray(connections.state, [...PENDING_VOICE_AUDIO_STATES]),
    ) });
    if (pending) return pendingReplay(pending, args, target.key, actor.accountSid);
    if (current && current.target_key === target.key && current.destination === destination)
      return { ok: true as const, connection: current, replayed: true };
    if (await lacksIdleCredits(tx, args.workspaceId, actor.owner.credits, target.kind))
      return voiceAudioRefusal("insufficient_credits");
    const latest = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: eq(connections.user_id, args.userId),
      orderBy: [desc(connections.generation)], columns: { generation: true } });
    const id = randomUUID();
    const [connection] = await actor.tdb.workspace_voice_audio_connection.insert({
      id, user_id: args.userId, intent_id: args.intentId, target_kind: target.kind, target_key: target.key,
      requested_call_sid: args.callSid, reservation_id: target.reservationId, campaign_id: target.campaignId,
      customer_sid: target.customerSid, original_agent_sid: target.originalAgentSid, source_agent_sid: sourceSid,
      source_connection_id: current?.id, generation: (latest?.generation ?? 0) + 1,
      transport: args.transport, destination, account_sid: actor.accountSid, caller_id: target.callerId,
      conference_id: target.conferenceId ?? `${args.userId}~${randomUUID()}`, conference_sid: target.conferenceSid,
      voice_url: voiceAudioOperationUrl(args.baseUrl, id, "voice"), status_callback: voiceAudioOperationUrl(args.baseUrl, id, "status"),
      conference_callback: target.conferenceCallback ?? voiceAudioOperationUrl(args.baseUrl, id, "conference"),
      lease_token: randomUUID(), lease_expires_at: new Date(Date.now() + LEASE_MS),
    });
    if (!connection) throw new Error("Agent audio preparation was not saved");
    return { ok: true as const, connection, replayed: false };
  });
}

function originalInput(row: VoiceAudioConnection): VoiceAudioConnectionInput {
  return { workspaceId: row.workspace, userId: row.user_id, intentId: row.intent_id, transport: row.transport,
    phoneNumber: row.transport === "phone" ? row.destination : undefined, callSid: row.requested_call_sid ?? undefined,
    expectedAgentSid: row.requested_call_sid ? row.source_agent_sid ?? undefined : undefined,
    campaignId: row.requested_call_sid ? undefined : row.campaign_id ?? undefined };
}

/** Commit before provider create. A timeout cannot return this row to prepared. */
export async function claimVoiceAudioSend(row: VoiceAudioConnection) {
  return db.transaction(async (tx) => {
    const args = originalInput(row), actor = await lockVoiceAudioActor(tx, args);
    if (!actor.ok) return actor;
    const [current] = await tx.select().from(connections).where(and(eq(connections.id, row.id), eq(connections.workspace, row.workspace))).for("update");
    if (!current || current.user_id !== row.user_id || current.lease_token !== row.lease_token || current.state !== "prepared" ||
        current.send_started_at || current.cancel_requested_at || current.lease_expires_at.getTime() <= Date.now())
      return voiceAudioRefusal("connection_pending");
    const active = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: and(
      eq(connections.user_id, row.user_id), eq(connections.state, "active"),
    ) }) ?? null;
    const admission = await resolveVoiceAudioAdmission(actor, args, active);
    if (!admission.ok) return admission;
    if (actor.accountSid !== row.account_sid || admission.destination !== row.destination || admission.target.key !== row.target_key)
      return voiceAudioRefusal("account_changed");
    if (await lacksIdleCredits(tx, row.workspace, actor.owner.credits, row.target_kind))
      return voiceAudioRefusal("insufficient_credits");
    const [started] = await tx.update(connections).set({ state: "creating", send_started_at: sql`clock_timestamp()`, updated_at: new Date() })
      .where(eq(connections.id, current.id)).returning();
    if (!started) throw new Error("Agent audio send checkpoint was not saved");
    return { ok: true as const, connection: started };
  });
}

export async function findVoiceAudioConnection(connectionId: string) {
  const [row] = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  return row ?? null;
}

/** Provider receipt uses immutable ownership; a removed agent cannot erase acceptance. */
export async function withVoiceAudioConnection<T>(row: VoiceAudioConnection, run: (tx: CreditTransaction, current: VoiceAudioConnection) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, row.workspace)).for("no key update");
    const [current] = await tx.select().from(connections).where(and(eq(connections.id, row.id), eq(connections.workspace, row.workspace))).for("update");
    if (!current || current.user_id !== row.user_id || current.account_sid !== row.account_sid || current.voice_url !== row.voice_url || current.status_callback !== row.status_callback)
      throw new Error("Agent audio operation does not match its owner");
    return run(tx, current);
  });
}

export async function persistVoiceAudioCall(tx: CreditTransaction, row: VoiceAudioConnection) {
  if (!row.provider_sid || !row.send_started_at) throw new Error("Agent audio provider receipt missing");
  await tx.insert(call).values({ sid: row.provider_sid, workspace: row.workspace, user_id: row.user_id,
    account_sid: row.account_sid, to: row.destination, from: row.caller_id, direction: "outbound-api", parent_call_sid: null,
    conference_id: row.conference_id, status: row.terminal_status ? normalizeAudioStatus(row.terminal_status) : "initiated",
    contact_id: null, outreach_attempt_id: null, queue_id: null,
  }).onConflictDoNothing({ target: call.sid });
  const [saved] = await tx.select().from(call).where(and(eq(call.sid, row.provider_sid), eq(call.workspace, row.workspace)));
  if (!saved || saved.account_sid !== row.account_sid || saved.to !== row.destination || saved.from !== row.caller_id || saved.direction !== "outbound-api" || saved.parent_call_sid)
    throw new Error("Agent audio call record does not match its provider receipt");
  return saved;
}

function normalizeAudioStatus(status: string) {
  return status === "busy" || status === "no-answer" || status === "failed" || status === "canceled" ? status : "completed";
}

export async function recordVoiceAudioProvider(row: VoiceAudioConnection, providerSid: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(providerSid)) throw new Error("Invalid agent audio provider SID");
  return withVoiceAudioConnection(row, (tx, current) => saveVoiceAudioProvider(tx, current, providerSid));
}

export async function saveVoiceAudioProvider(tx: CreditTransaction, current: VoiceAudioConnection, providerSid: string) {
  if (!current.send_started_at || current.provider_sid && current.provider_sid !== providerSid)
    throw new Error("Agent audio receipt does not match its send");
  const [saved] = await tx.update(connections).set({ provider_sid: providerSid,
    state: current.state === "creating" ? "joining" : current.state, updated_at: new Date() })
    .where(eq(connections.id, current.id)).returning();
  if (!saved) throw new Error("Agent audio acknowledgement was not saved");
  try { await tx.transaction((sp) => persistVoiceAudioCall(sp, saved)); }
  catch (error) {
    await tx.update(connections).set({ last_error: "Accepted audio call record needs recovery", lease_expires_at: new Date() }).where(eq(connections.id, saved.id));
    logger.error("voice_audio.call_record_pending", error);
  }
  return saved;
}

export async function failUnacceptedVoiceAudio(row: VoiceAudioConnection) {
  const [failed] = await db.update(connections).set({ state: "failed", updated_at: new Date() }).where(and(
    eq(connections.id, row.id), eq(connections.workspace, row.workspace), eq(connections.lease_token, row.lease_token),
    eq(connections.state, "creating"), isNull(connections.provider_sid),
  )).returning();
  return failed ?? null;
}

export async function deferVoiceAudioConnection(row: VoiceAudioConnection) {
  await db.update(connections).set({ last_error: "Agent audio creation or acknowledgement needs recovery", lease_expires_at: new Date() })
    .where(and(eq(connections.id, row.id), eq(connections.workspace, row.workspace), eq(connections.lease_token, row.lease_token),
      inArray(connections.state, [...PENDING_VOICE_AUDIO_STATES])));
}

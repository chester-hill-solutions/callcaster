import { and, eq, gt, inArray, isNotNull, isNull, ne, notExists, or } from "drizzle-orm";
import { call, workspace, workspace_voice_dialer_intent as intents, workspace_voice_reservation as reservations,
  workspace_voice_audio_connection as audio, workspace_voice_audio_intent as audioIntents } from "@/db/schema";
import { db } from "./db";
import { dialerIntentIdentity, type VoiceDialerIntent } from "./voice-dialer-intent.server";
import { requeueCampaignQueueById } from "@/lib/campaign-queue-updates.server";
import { isTerminalStatus, normalizeProviderStatus, TERMINAL_CALL_STATUSES } from "@/lib/call-status";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { persistReservedVoiceCall } from "./voice-reservation-callback.server";
import { voiceCallLegIdentity } from "@/lib/voice-bridge-identity";
import { emitPostgresChangeEvent } from "@/lib/workspace-events.server";
import type { CallInstance } from "twilio/lib/rest/api/v2010/account/call";

function currentStop(owner: VoiceDialerIntent) {
  return and(dialerIntentIdentity({ workspaceId: owner.workspace, userId: owner.user_id, campaignId: owner.campaign_id, intentId: owner.intent_id }),
    eq(intents.campaign_id, owner.campaign_id), eq(intents.lease_token, owner.lease_token), isNotNull(intents.stop_requested_at),
    isNull(intents.stopped_at), gt(intents.lease_expires_at, new Date()));
}
function callOwner(owner: VoiceDialerIntent) {
  return and(eq(reservations.workspace, owner.workspace), eq(reservations.user_id, owner.user_id),
    eq(reservations.dialer_intent_id, owner.intent_id));
}
function pendingCalls(tx: CreditTransaction, owner: VoiceDialerIntent) {
  const setupUnknown = and(or(isNotNull(reservations.setup_to), isNotNull(reservations.setup_client_identity)), isNull(reservations.setup_sid));
  const childUnknown = and(isNull(reservations.provider_sid), or(and(isNull(reservations.setup_to), isNull(reservations.setup_client_identity)),
    isNotNull(reservations.recipient_instruction_issued_at)));
  const openLeg = (sid: typeof reservations.setup_sid | typeof reservations.provider_sid) => and(isNotNull(sid), notExists(tx.select({ sid: call.sid }).from(call).where(and(
    eq(call.workspace, owner.workspace), eq(call.account_sid, owner.account_sid ?? ""),
    eq(call.sid, sid), inArray(call.status, [...TERMINAL_CALL_STATUSES])))));
  return tx.select().from(reservations).where(and(callOwner(owner), ne(reservations.state, "released"), or(
    and(eq(reservations.state, "reserved"), isNull(reservations.send_started_at)),
    and(isNotNull(reservations.send_started_at), or(setupUnknown, childUnknown, openLeg(reservations.setup_sid), openLeg(reservations.provider_sid))),
  ))).orderBy(reservations.id).limit(25);
}
async function originalReservation(tx: CreditTransaction, owner: VoiceDialerIntent) {
  if (!owner.reservation_id) throw new Error("Dialer Stop lost its original reservation");
  const [original] = await tx.select().from(reservations).where(and(callOwner(owner), eq(reservations.id, owner.reservation_id)));
  if (!original || original.account_sid !== owner.account_sid || original.conference_id !== owner.conference_id ||
    original.campaign_id !== null && original.campaign_id !== owner.campaign_id)
    throw new Error("Dialer Stop cannot prove its original room owner");
  return original;
}
export async function requireOwnedDialerStop(owner: VoiceDialerIntent) {
  const [current] = await db.select({ id: intents.intent_id }).from(intents).where(currentStop(owner)).limit(1);
  if (!current) throw new Error("Dialer Stop no longer owns cleanup");
}
export async function readDialerStopCalls(owner: VoiceDialerIntent) {
  return db.transaction(async tx => {
    await originalReservation(tx, owner);
    const rows = await pendingCalls(tx, owner);
    if (rows.some(row => row.account_sid !== owner.account_sid || row.conference_id !== owner.conference_id ||
      row.campaign_id !== null && row.campaign_id !== owner.campaign_id))
      throw new Error("Dialer Stop cannot prove its funded calls");
    return rows;
  });
}
export async function isDialerCallClosed(owner: VoiceDialerIntent, sid: string) {
  const [saved] = await db.select({ sid: call.sid }).from(call).where(and(eq(call.workspace, owner.workspace),
    eq(call.account_sid, owner.account_sid ?? ""), eq(call.sid, sid), inArray(call.status, [...TERMINAL_CALL_STATUSES]))).limit(1);
  return Boolean(saved);
}
function matchesStoppedLeg(current: VoiceReservation, purpose: "setup" | "recipient", remote: CallInstance) {
  const expected = voiceCallLegIdentity(current, purpose), sid = purpose === "setup" ? current.setup_sid : current.provider_sid;
  const status = normalizeProviderStatus(remote.status);
  return Boolean(status && isTerminalStatus(status) && remote.sid === sid && remote.accountSid === current.account_sid && remote.to === expected.to &&
    remote.from === expected.from && remote.direction === expected.direction && (remote.parentCallSid || null) === expected.parent_call_sid);
}
/** An actual provider receipt records closure without inventing final duration or billing. */
export async function recordDialerStoppedCall(owner: VoiceDialerIntent, snapshot: VoiceReservation, purpose: "setup" | "recipient", remote: CallInstance) {
  const savedCall = await db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [intent] = await tx.select({ id: intents.intent_id }).from(intents).where(currentStop(owner));
    const [current] = await tx.select().from(reservations).where(and(callOwner(owner), eq(reservations.id, snapshot.id))).for("update");
    if (!intent || !current) throw new Error("Dialer Stop lost its provider receipt owner");
    const status = normalizeProviderStatus(remote.status);
    if (!matchesStoppedLeg(current, purpose, remote))
      throw new Error("Dialer Stop receipt does not match its funded leg");
    const [updated] = await tx.update(reservations).set(purpose === "setup" ? {
      setup_terminal_at: current.setup_terminal_at ?? new Date(), setup_terminal_status: current.setup_terminal_status ?? status,
      lease_expires_at: new Date(), updated_at: new Date(),
    } : { terminal_status: current.terminal_status ?? status,
      human_state: current.human_state && current.human_state !== "refused" ? "ended" : current.human_state,
      lease_expires_at: new Date(), updated_at: new Date(),
    }).where(eq(reservations.id, current.id)).returning();
    if (!updated) throw new Error("Dialer Stop receipt was not saved");
    await persistReservedVoiceCall(tx, updated, remote.sid, purpose);
    const [saved] = await tx.update(call).set({ status: normalizeProviderStatus(purpose === "setup" ? updated.setup_terminal_status : updated.terminal_status),
      ...(purpose === "recipient" && updated.terminal_duration === null ? { duration: null, call_duration: null } : {}),
      date_updated: remote.dateUpdated ?? new Date(), end_time: remote.endTime ?? undefined,
    }).where(and(eq(call.workspace, owner.workspace), eq(call.sid, remote.sid))).returning();
    return saved;
  });
  if (savedCall) emitPostgresChangeEvent(owner.workspace, { eventType: "UPDATE", table: "call", schema: "public", new: savedCall, old: null });
}
function pendingAudio(owner: VoiceDialerIntent) {
  return and(eq(audio.workspace, owner.workspace), eq(audio.user_id, owner.user_id), eq(audio.account_sid, owner.account_sid ?? ""),
    eq(audio.conference_id, owner.conference_id ?? ""), isNull(audio.terminal_at),
    or(isNotNull(audio.send_started_at), isNotNull(audio.provider_sid), eq(audio.state, "prepared")));
}
export function readDialerStopAudio(owner: VoiceDialerIntent) {
  if (!owner.account_sid || !owner.conference_id) throw new Error("Dialer Stop has no original audio identity");
  return db.select().from(audio).where(pendingAudio(owner));
}
export async function readDialerAudioResource(owner: VoiceDialerIntent, id: string) {
  const [row] = await db.select().from(audio).where(and(eq(audio.id, id), eq(audio.workspace, owner.workspace), eq(audio.user_id, owner.user_id),
    eq(audio.account_sid, owner.account_sid ?? ""), eq(audio.conference_id, owner.conference_id ?? ""))).limit(1);
  return row ?? null;
}

/** Freeze admission before reading a bounded batch and canceling audio sends. */
export async function readDialerStopResources(owner: VoiceDialerIntent) {
  const publish: Array<() => Promise<void>> = [];
  const result = await db.transaction(async tx => {
    await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, owner.workspace)).for("no key update");
    const [current] = await tx.select().from(intents).where(currentStop(owner)).for("update");
    if (!current?.stop_requested_at || !current.account_sid || !current.conference_id) throw new Error("Dialer Stop resource identity is unavailable");
    const original = await originalReservation(tx, current), roots = await pendingCalls(tx, current);
    if (roots.some(row => row.account_sid !== current.account_sid || row.conference_id !== current.conference_id ||
      row.campaign_id !== null && row.campaign_id !== current.campaign_id))
      throw new Error("Dialer Stop cannot prove its funded calls");
    for (const row of roots) {
      if (row.state !== "reserved" || row.send_started_at || row.provider_sid || row.setup_sid) continue;
      await tx.update(reservations).set({ state: "released", updated_at: new Date() }).where(and(eq(reservations.id, row.id),
        eq(reservations.lease_token, row.lease_token), eq(reservations.state, "reserved"), isNull(reservations.send_started_at)));
      if (row.queue_id && row.queue_generation) await requeueCampaignQueueById(row.queue_id, row.workspace, { exec: tx,
        userId: current.user_id, expectedGeneration: row.queue_generation, voiceReservationId: row.id, deferEmit: emit => publish.push(emit) });
    }
    const connections = await tx.select().from(audio).where(pendingAudio(current)).for("update");
    for (const row of connections) {
      if (row.cancel_requested_at) continue;
      await tx.update(audio).set({ cancel_requested_at: new Date(), state: row.send_started_at ? row.state : "canceled",
        lease_expires_at: new Date(), updated_at: new Date() }).where(eq(audio.id, row.id));
      await tx.update(audioIntents).set({ cancel_requested_at: new Date() }).where(and(eq(audioIntents.workspace, current.workspace),
        eq(audioIntents.user_id, current.user_id), eq(audioIntents.intent_id, row.control_intent_id ?? row.intent_id)));
    }
    return { intent: current, original, reservations: roots, audio: connections };
  });
  for (const emit of publish) await emit();
  return result;
}

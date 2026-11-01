import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { workspace_voice_dialer_intent as intents, workspace_voice_reservation as reservations } from "@/db/schema";
import type { VoiceDialerRequest } from "@/db/schema-voice-dialer-intent";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { PredictiveConferenceStartIdentity } from "./predictive-start-replay.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";

export type VoiceDialerIntent = typeof intents.$inferSelect;
export type DialerIntentOwner = { workspaceId: string; userId: string; intentId: string; campaignId: number };

export function dialerIntentIdentity(owner: DialerIntentOwner) {
  return and(eq(intents.workspace, owner.workspaceId), eq(intents.user_id, owner.userId), eq(intents.intent_id, owner.intentId));
}
export function findDialerIntent(tx: CreditTransaction, owner: DialerIntentOwner) {
  return tx.select().from(intents).where(dialerIntentIdentity(owner)).limit(1).then(rows => rows[0] ?? null);
}
export async function hasPendingDialerStop(tx: CreditTransaction, workspaceId: string, userId: string) {
  const rows = await tx.select({ id: intents.intent_id }).from(intents).where(and(eq(intents.workspace, workspaceId), eq(intents.user_id, userId),
    isNotNull(intents.stop_requested_at), isNull(intents.stopped_at))).limit(1);
  return rows.length > 0;
}
export async function dialerReservationIsStopped(tx: CreditTransaction, row: VoiceReservation) {
  if (!row.dialer_intent_id) return false;
  if (!row.user_id || !row.campaign_id) return true;
  const owner = await findDialerIntent(tx, { workspaceId: row.workspace, userId: row.user_id, campaignId: row.campaign_id, intentId: row.dialer_intent_id });
  return !owner || owner.campaign_id !== row.campaign_id || Boolean(owner.stop_requested_at || owner.retired_at);
}
export function dialerStartOwner(input: PredictiveConferenceStartIdentity): DialerIntentOwner {
  const prefix = "predictive-start:", intentId = input.setup.intentKey.slice(prefix.length);
  if (!input.setup.intentKey.startsWith(prefix) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(intentId))
    throw new Error("Predictive Start has no saved request identity");
  return { workspaceId: input.workspaceId, userId: input.userId, campaignId: input.campaignId, intentId };
}
function requestIdentity(input: PredictiveConferenceStartIdentity): VoiceDialerRequest {
  return { to: input.setup.to, callerId: input.setup.callerId,
    audioConnectionId: input.audioSource?.connectionId ?? null, audioGeneration: input.audioSource?.generation ?? null };
}
function sameRequest(saved: VoiceDialerIntent, input: PredictiveConferenceStartIdentity) {
  const expected = requestIdentity(input), request = saved.request;
  return saved.campaign_id === input.campaignId && (!request || request.to === expected.to && request.callerId === expected.callerId &&
    request.audioConnectionId === expected.audioConnectionId && request.audioGeneration === expected.audioGeneration);
}

/** Caller retains the workspace fence through funding and the send checkpoint. */
export async function checkDialerStartIntent(tx: CreditTransaction, input: PredictiveConferenceStartIdentity) {
  const owner = dialerStartOwner(input), saved = await findDialerIntent(tx, owner);
  if (saved && (!sameRequest(saved, input) || saved.stop_requested_at)) return { ok: false as const, reason: "dialer_stopped" as const };
  const pending = await tx.select({ id: intents.intent_id }).from(intents).where(and(eq(intents.workspace, owner.workspaceId),
    eq(intents.user_id, owner.userId), isNotNull(intents.stop_requested_at), isNull(intents.stopped_at))).limit(1);
  if (pending.length) return { ok: false as const, reason: "dialer_stopped" as const };
  const active = await tx.select().from(intents).where(and(eq(intents.workspace, owner.workspaceId), eq(intents.user_id, owner.userId),
    isNotNull(intents.reservation_id), isNull(intents.stop_requested_at), isNull(intents.retired_at))).limit(1);
  const current = active[0];
  if (current && current.intent_id !== owner.intentId) {
    const [first] = await tx.select().from(reservations).where(eq(reservations.id, current.reservation_id ?? "")).limit(1);
    if (!first || first.state !== "released" || first.provider_sid || first.setup_sid && !first.setup_terminal_at)
      return { ok: false as const, reason: "dispatch_in_progress" as const };
    await tx.update(intents).set({ retired_at: new Date(), updated_at: new Date() }).where(dialerIntentIdentity({ ...owner, intentId: current.intent_id }));
  }
  return null;
}

export async function checkDialerRoomIntent(tx: CreditTransaction, owner: { workspaceId: string; userId: string; campaignId: number; conferenceId: string; accountSid: string }) {
  const rows = await tx.select().from(intents).where(and(eq(intents.workspace, owner.workspaceId), eq(intents.user_id, owner.userId),
    eq(intents.campaign_id, owner.campaignId), eq(intents.conference_id, owner.conferenceId), eq(intents.account_sid, owner.accountSid)));
  const active = rows.find(row => !row.stop_requested_at && !row.retired_at);
  if (active) return active;
  return rows.some(row => row.stop_requested_at && !row.retired_at) ? { ok: false as const, reason: "dialer_stopped" as const } : null;
}

/** The first funded reservation fixes account and room ownership for this Start. */
export async function bindDialerStartIntent(tx: CreditTransaction, input: PredictiveConferenceStartIdentity, reservation: VoiceReservation) {
  const owner = dialerStartOwner(input);
  if (await checkDialerStartIntent(tx, input)) throw new Error("Stopped Start reached its send checkpoint");
  const values = { workspace: owner.workspaceId, user_id: owner.userId, intent_id: owner.intentId, campaign_id: owner.campaignId,
    request: requestIdentity(input), account_sid: reservation.account_sid, conference_id: reservation.conference_id,
    reservation_id: reservation.id, retired_at: null, updated_at: new Date() };
  const saved = await findDialerIntent(tx, owner);
  if (saved) await tx.update(intents).set(values).where(dialerIntentIdentity(owner));
  else await tx.insert(intents).values(values);
  await tx.update(reservations).set({ dialer_intent_id: owner.intentId }).where(eq(reservations.id, reservation.id));
  return owner.intentId;
}

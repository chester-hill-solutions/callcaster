import { and, eq, inArray, ne } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { db } from "@/server/db";
import { voiceAudioRefusal } from "@/lib/voice-audio-connection";
import { lockVoiceAudioActor } from "./voice-audio-admission.server";
import { hasPendingVoiceAudioConferenceStop, voiceAudioSourceRetirementWhere } from "./voice-audio-classification.server";
import { hasUnresolvedVoiceAudioPromotion } from "./voice-audio-manual-topology.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

export type VoiceAudioCustomerSourceInput = {
  workspaceId: string; userId: string; connectionId: string; generation: number;
  campaignId: number; phoneNumber: string;
};

/** A short-lived observation, never an accepted customer intent or a credit hold. */
export type VoiceAudioCustomerSourceProof = {
  connectionId: string; generation: number; accountSid: string; callSid: string;
  conferenceId: string; conferenceSid: string; destination: string; callerId: string;
  callbackUrl: string; observedAt: number;
};

export const VOICE_AUDIO_SOURCE_PROOF_MS = 5000;

function matchesSource(row: VoiceAudioConnection, input: VoiceAudioCustomerSourceInput) {
  return row.generation === input.generation && row.transport === "phone" && row.destination === input.phoneNumber &&
    row.target_kind === "idle" && (row.campaign_id === null || row.campaign_id === input.campaignId) &&
    row.state === "active" && row.committed_at && row.voice_issued_at && row.joined_at && row.provider_sid && row.conference_sid &&
    !row.cancel_requested_at && !row.terminal_at && !row.conference_stop_requested_at && !row.conference_stopped_at;
}

/** The caller keeps this transaction through funding and the customer send checkpoint. */
export async function lockVoiceAudioCustomerSource(tx: CreditTransaction, input: VoiceAudioCustomerSourceInput) {
  const actor = await lockVoiceAudioActor(tx, input);
  if (!actor.ok) return actor;
  const [row] = await tx.select().from(connections).where(and(eq(connections.id, input.connectionId),
    eq(connections.workspace, input.workspaceId), eq(connections.user_id, input.userId))).for("update");
  if (!row) return voiceAudioRefusal("connection_not_found");
  if (!matchesSource(row, input) || !row.provider_sid) return voiceAudioRefusal("stale_audio");
  if (actor.accountSid !== row.account_sid) return voiceAudioRefusal("account_changed");
  if (!actor.actor.numbers?.includes(row.destination)) return voiceAudioRefusal("device_not_verified");
  if (await hasPendingVoiceAudioConferenceStop(actor.tdb, row.user_id) || await hasUnresolvedVoiceAudioPromotion(actor.tdb, row.user_id))
    return voiceAudioRefusal("connection_pending");
  const conflicting = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: and(
    eq(connections.user_id, row.user_id), ne(connections.id, row.id),
    inArray(connections.state, ["prepared", "creating", "joining", "ready", "switching", "active"]),
  ), columns: { id: true } });
  if (conflicting) return voiceAudioRefusal("connection_pending");
  const retired = await actor.tdb.workspace_voice_audio_connection.findFirst({ where: voiceAudioSourceRetirementWhere({
    workspaceId: row.workspace, accountSid: row.account_sid, callSid: row.provider_sid,
  }), columns: { id: true } });
  if (retired) return voiceAudioRefusal("stale_audio");
  return { ok: true as const, connection: row };
}

export function readVoiceAudioCustomerSource(input: VoiceAudioCustomerSourceInput) {
  return db.transaction(tx => lockVoiceAudioCustomerSource(tx, input));
}

export function voiceAudioCustomerSourceProof(row: VoiceAudioConnection, observedAt: number): VoiceAudioCustomerSourceProof {
  if (!row.provider_sid || !row.conference_sid) throw new Error("Confirmed phone source identity is missing");
  return { connectionId: row.id, generation: row.generation, accountSid: row.account_sid, callSid: row.provider_sid,
    conferenceId: row.conference_id, conferenceSid: row.conference_sid, destination: row.destination, callerId: row.caller_id,
    callbackUrl: row.conference_callback, observedAt };
}

/** Recheck the observation under the same workspace fence used for customer funding. */
export async function lockVerifiedVoiceAudioCustomerSource(
  tx: CreditTransaction, input: VoiceAudioCustomerSourceInput, proof: VoiceAudioCustomerSourceProof,
) {
  const source = await lockVoiceAudioCustomerSource(tx, input);
  if (!source.ok) return source;
  const expected = voiceAudioCustomerSourceProof(source.connection, proof.observedAt);
  if (!Number.isFinite(proof.observedAt) || proof.observedAt > Date.now() || Date.now() - proof.observedAt >= VOICE_AUDIO_SOURCE_PROOF_MS ||
    expected.connectionId !== proof.connectionId || expected.generation !== proof.generation || expected.accountSid !== proof.accountSid ||
    expected.callSid !== proof.callSid || expected.conferenceId !== proof.conferenceId || expected.conferenceSid !== proof.conferenceSid ||
    expected.destination !== proof.destination || expected.callerId !== proof.callerId || expected.callbackUrl !== proof.callbackUrl)
    return voiceAudioRefusal("stale_audio");
  return source;
}

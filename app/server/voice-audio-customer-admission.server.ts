import { and, eq, inArray, ne, or, isNull, isNotNull } from "drizzle-orm";
import { workspace_voice_audio_connection as connections, workspace_voice_reservation as reservations } from "@/db/schema";
import { lockVerifiedVoiceAudioCustomerSource, type VoiceAudioCustomerSourceProof } from "./voice-audio-customer-source.server";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";
import type { VoiceReservation } from "./voice-credit-reservation.server";
import { RECOVERABLE_VOICE_AUDIO_STATES, VoiceAudioBindingError } from "@/lib/voice-audio-connection";

export type VoiceAudioCustomerIntent = {
  connectionId: string; generation: number; destination: string; mode: "manual" | "predictive";
};
export type VerifiedVoiceAudioCustomerIntent = VoiceAudioCustomerIntent & { proof: VoiceAudioCustomerSourceProof };

/** Called after intent replay, under the workspace funding lock. */
export async function hasUnresolvedVoiceAudioSource(tx: CreditTransaction, workspaceId: string, userId: string) {
  const [source] = await tx.select({ id: connections.id }).from(connections).where(and(
    eq(connections.workspace, workspaceId), eq(connections.user_id, userId),
    or(inArray(connections.state, [...RECOVERABLE_VOICE_AUDIO_STATES]),
      and(isNotNull(connections.provider_sid), isNull(connections.terminal_at)),
      and(isNotNull(connections.conference_stop_requested_at), isNull(connections.conference_stopped_at))),
  )).limit(1);
  return Boolean(source);
}

export function voiceAudioCustomerReservationFields(connection: VoiceAudioConnection, intent: VoiceAudioCustomerIntent) {
  return { conference_id: connection.conference_id, conference_sid: connection.conference_sid,
    audio_connection_id: intent.connectionId, audio_generation: intent.generation, audio_destination: intent.destination,
    audio_agent_sid: connection.provider_sid, audio_conference_callback: connection.conference_callback, audio_mode: intent.mode };
}

/** Existing accepted customer intents replay before this mutable admission check. */
export async function admitVoiceAudioCustomerSource(tx: CreditTransaction, args: {
  workspaceId: string; userId?: string | null; campaignId?: number | null; accountSid: string; kind: string;
  setupTo?: string | null; setupClientIdentity?: string | null; conferenceId?: string | null;
  audioSource: VerifiedVoiceAudioCustomerIntent;
}) {
  const unavailable = { ok: false as const, reason: "audio_source_unavailable" as const };
  const { audioSource: intent } = args;
  if (!args.userId || args.campaignId == null || args.kind !== "staffed" || args.setupTo != null || args.setupClientIdentity != null)
    return unavailable;
  const source = await lockVerifiedVoiceAudioCustomerSource(tx, { workspaceId: args.workspaceId, userId: args.userId,
    campaignId: args.campaignId, connectionId: intent.connectionId, generation: intent.generation, phoneNumber: intent.destination }, intent.proof);
  if (!source.ok || source.connection.account_sid !== args.accountSid ||
    args.conferenceId != null && source.connection.conference_id !== args.conferenceId) return unavailable;
  const [conflict] = await tx.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.workspace, args.workspaceId), eq(reservations.user_id, args.userId), eq(reservations.kind, "staffed"),
    inArray(reservations.state, ["reserved", "creating", "active"]),
    intent.mode === "manual" ? undefined : or(isNull(reservations.audio_connection_id), ne(reservations.audio_connection_id, intent.connectionId),
      ne(reservations.audio_generation, intent.generation), ne(reservations.audio_mode, "predictive"),
      ne(reservations.account_sid, args.accountSid), ne(reservations.conference_id, source.connection.conference_id)),
  )).limit(1);
  if (conflict) return unavailable;
  return { ok: true as const, connection: source.connection };
}

/** Keep the same workspace/audio locks through the one customer send checkpoint. */
export async function voiceAudioCustomerSendGuard(tx: CreditTransaction, row: VoiceReservation, proof?: VoiceAudioCustomerSourceProof) {
  if (!row.audio_connection_id) return isNull(reservations.audio_connection_id);
  if (!proof || !row.user_id || row.campaign_id == null || row.audio_generation == null || !row.audio_destination)
    throw new VoiceAudioBindingError("Customer send requires fresh confirmed phone audio");
  const result = await lockVerifiedVoiceAudioCustomerSource(tx, { workspaceId: row.workspace, userId: row.user_id,
    campaignId: row.campaign_id, connectionId: row.audio_connection_id, generation: row.audio_generation,
    phoneNumber: row.audio_destination }, proof);
  if (!result.ok || result.connection.account_sid !== row.account_sid || result.connection.provider_sid !== row.audio_agent_sid ||
    result.connection.conference_id !== row.conference_id || result.connection.conference_sid !== row.conference_sid ||
    result.connection.conference_callback !== row.audio_conference_callback)
    throw new VoiceAudioBindingError("Customer phone audio changed before send");
  return and(eq(reservations.audio_connection_id, row.audio_connection_id), eq(reservations.audio_generation, row.audio_generation),
    eq(reservations.audio_destination, row.audio_destination), eq(reservations.account_sid, proof.accountSid),
    eq(reservations.audio_agent_sid, proof.callSid), eq(reservations.conference_id, proof.conferenceId),
    eq(reservations.conference_sid, proof.conferenceSid), eq(reservations.audio_conference_callback, proof.callbackUrl));
}

import { and, eq } from "drizzle-orm";
import { workspace_voice_audio_connection as connections, workspace_voice_audio_intent as intents } from "@/db/schema";
import { normalizePhoneNumber } from "@/lib/phone";
import { voiceAudioRefusal, type VoiceAudioConnectionInput, type VoiceAudioRequestIdentity } from "@/lib/voice-audio-connection";
import type { TenantDb } from "./tenant-db";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

export type VoiceAudioIntent = typeof intents.$inferSelect;

export function voiceAudioRequestIdentity(args: VoiceAudioConnectionInput): VoiceAudioRequestIdentity {
  return { transport: args.transport, destination: args.transport === "phone" ? normalizePhoneNumber(args.phoneNumber ?? "") : null,
    callSid: args.callSid ?? null, expectedAgentSid: args.expectedAgentSid ?? null, campaignId: args.campaignId ?? null };
}

export function findVoiceAudioIntent(tdb: TenantDb, args: { userId: string; intentId: string }) {
  return tdb.workspace_voice_audio_intent.findFirst({ where: and(eq(intents.user_id, args.userId), eq(intents.intent_id, args.intentId)) });
}

/** Caller holds the workspace fence. Reuse changes controls, not physical identity. */
export async function bindVoiceAudioIntent(tdb: TenantDb, args: VoiceAudioConnectionInput, row: VoiceAudioConnection) {
  if (row.cancel_requested_at) return voiceAudioRefusal("connection_pending");
  await tdb.workspace_voice_audio_intent.insert({ user_id: args.userId, intent_id: args.intentId,
    request: voiceAudioRequestIdentity(args), connection_id: row.id });
  const [connection] = await tdb.workspace_voice_audio_connection.update({ set: { control_intent_id: args.intentId }, where: eq(connections.id, row.id) });
  if (!connection) throw new Error("Audio request control owner was not saved");
  return { ok: true as const, connection, replayed: true };
}

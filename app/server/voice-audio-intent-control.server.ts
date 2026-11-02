import { and, eq } from "drizzle-orm";
import { workspace_voice_audio_connection as connections, workspace_voice_audio_intent as intents } from "@/db/schema";
import { db } from "@/server/db";
import { voiceAudioRefusal } from "@/lib/voice-audio-connection";
import { lockVoiceAudioMember } from "./voice-audio-admission.server";
import { findVoiceAudioIntent, type VoiceAudioIntent } from "./voice-audio-intent.server";
import { cancelVoiceAudioConnectionInTransaction } from "./voice-audio-lifecycle.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";

type IntentOwner = { workspaceId: string; userId: string; intentId: string };
export type VoiceAudioIntentControl = { intent: VoiceAudioIntent; connection: VoiceAudioConnection | null };

/** The workspace fence orders cancellation, admission and reuse across screens. */
export async function controlOwnedVoiceAudioIntent(args: IntentOwner, cancel = false) {
  return db.transaction(async (tx) => {
    const member = await lockVoiceAudioMember(tx, args, true);
    if (!member.ok) return member;
    let intent = await findVoiceAudioIntent(member.tdb, args);
    if (!intent) {
      if (!cancel) return voiceAudioRefusal("connection_not_found");
      [intent] = await member.tdb.workspace_voice_audio_intent.insert({ user_id: args.userId, intent_id: args.intentId, cancel_requested_at: new Date() });
      if (!intent) throw new Error("Audio request cancellation was not saved");
    }
    const [row] = intent.connection_id ? await tx.select().from(connections).where(and(eq(connections.workspace, args.workspaceId),
      eq(connections.user_id, args.userId), eq(connections.id, intent.connection_id))).for("update") : [];
    let connection = row && (row.control_intent_id ?? row.intent_id) === args.intentId ? row : null;
    if (cancel) {
      if (connection) {
        const result = await cancelVoiceAudioConnectionInTransaction(tx, connection);
        if (!result.ok) return result;
        connection = result.connection;
      }
      if (!intent.cancel_requested_at) {
        const [saved] = await member.tdb.workspace_voice_audio_intent.update({ set: { cancel_requested_at: new Date() },
          where: and(eq(intents.user_id, args.userId), eq(intents.intent_id, args.intentId)) });
        if (!saved) throw new Error("Audio request cancellation was not saved");
        intent = saved;
      }
    }
    return { ok: true as const, intent, connection };
  });
}

import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { db } from "@/server/db";
import { PENDING_VOICE_AUDIO_STATES, RECOVERABLE_VOICE_AUDIO_STATES, voiceAudioRefusal } from "@/lib/voice-audio-connection";
import { voiceAudioCurrentSnapshotSchema } from "@/lib/schemas/api/voice-audio";
import { voiceAudioIntentSnapshot } from "@/lib/voice-audio-api.server";
import { lockVoiceAudioMember } from "./voice-audio-admission.server";
import { findVoiceAudioIntent } from "./voice-audio-intent.server";
import { hasFundedAgentVoice, hasPendingVoiceAudioConferenceStop } from "./voice-audio-classification.server";
import { hasUnresolvedVoiceAudioPromotion } from "./voice-audio-manual-topology.server";
import type { VoiceAudioConnection } from "./voice-audio-connection.server";
import type { TenantDb } from "./tenant-db";
import { readPredictiveCustomerRecovery } from "./predictive-customer-current.server";
import { readManualCustomerRecovery } from "./manual-customer-current.server";
import { readCurrentDialer } from "./voice-dialer-current.server";

async function currentIntent(tdb: TenantDb, row: VoiceAudioConnection | undefined) {
  if (!row) return null;
  const intent = await findVoiceAudioIntent(tdb, { userId: row.user_id, intentId: row.control_intent_id ?? row.intent_id });
  return intent?.connection_id === row.id && intent.request ? voiceAudioIntentSnapshot({ intent, connection: row }) : null;
}

/** Read under admission's workspace fence; no provider command or control write. */
export function readCurrentOwnedVoiceAudio(args: { workspaceId: string; userId: string }) {
  return db.transaction(async tx => {
    const member = await lockVoiceAudioMember(tx, args, true);
    if (!member.ok) return member;
    const rows = await member.tdb.workspace_voice_audio_connection.findMany({ where: and(eq(connections.user_id, args.userId),
      or(inArray(connections.state, [...RECOVERABLE_VOICE_AUDIO_STATES]),
        and(isNotNull(connections.provider_sid), isNull(connections.terminal_at)))), orderBy: [desc(connections.generation)] });
    const active = rows.filter(row => row.state === "active");
    const pending = rows.filter(row => PENDING_VOICE_AUDIO_STATES.some(state => state === row.state));
    if (active.length > 1 || pending.length > 1) return voiceAudioRefusal("connection_pending");
    const activeIntent = await currentIntent(member.tdb, active[0]);
    const pendingIntent = await currentIntent(member.tdb, pending[0]);
    if (active.length && !activeIntent || pending.length && !pendingIntent) return voiceAudioRefusal("stale_audio");
    const recoveryRequired = rows.some(row => row.cancel_requested_at || row.terminal_at ||
      !RECOVERABLE_VOICE_AUDIO_STATES.some(state => state === row.state)) ||
      await hasPendingVoiceAudioConferenceStop(member.tdb, args.userId) || await hasUnresolvedVoiceAudioPromotion(member.tdb, args.userId);
    const predictive = await readPredictiveCustomerRecovery(member.tdb, args.userId);
    const manual = await readManualCustomerRecovery(member.tdb, args.userId);
    const control = await readCurrentDialer(member.tdb, args.userId);
    if (!predictive || !manual || !control.ok) return voiceAudioRefusal("stale_audio");
    const current = voiceAudioCurrentSnapshotSchema.safeParse({ workspace_id: args.workspaceId, user_id: args.userId, predictive, manual: manual.customer,
      dialer: control.dialer, active: activeIntent, pending: pendingIntent, recovery_required: recoveryRequired || control.dialer?.dialer_state === "stopping",
      customer_pending: await hasFundedAgentVoice(member.tdb, args.userId) });
    return current.success ? { ok: true as const, current: current.data } : voiceAudioRefusal("stale_audio");
  });
}

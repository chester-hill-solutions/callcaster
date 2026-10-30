import { eq } from "drizzle-orm";
import { workspace_voice_audio_connection as connections } from "@/db/schema";
import { VoiceAudioBindingError } from "@/lib/voice-audio-connection";
import type { CreditTransaction } from "./outbound-credit-reservations.server";
import { voiceAudioSourceRetirementWhere } from "./voice-audio-classification.server";
import { withVoiceAudioConnection, type VoiceAudioConnection } from "./voice-audio-connection.server";

export function hasUnfinishedVoiceAudioConferenceStop(row: VoiceAudioConnection) {
  return Boolean(row.conference_stop_requested_at && !row.conference_stopped_at);
}

async function ownsConferenceEnd(tx: CreditTransaction, row: VoiceAudioConnection, callSid: string) {
  if (row.customer_sid === callSid && row.reservation_id) return true;
  const currentAudio = callSid === row.provider_sid && row.committed_at && !row.retired_at && row.state !== "retired";
  const originalParent = callSid === row.original_agent_sid && row.promotion_requested_at;
  if (!currentAudio && !originalParent) return false;
  const [successor] = await tx.select({ id: connections.id }).from(connections).where(voiceAudioSourceRetirementWhere({
    workspaceId: row.workspace, accountSid: row.account_sid, callSid,
  })).limit(1);
  return !successor;
}

/** The workspace lock orders source retirement and this irreversible room intent. */
export async function requestVoiceAudioConferenceStop(owner: VoiceAudioConnection, callSid: string) {
  return withVoiceAudioConnection(owner, async (tx, current) => {
    if (!await ownsConferenceEnd(tx, current, callSid)) return null;
    if (!/^CF[0-9a-f]{32}$/i.test(current.conference_sid ?? "")) throw new VoiceAudioBindingError("Owned conference SID is missing");
    if (current.conference_stop_requested_at) return current;
    const [saved] = await tx.update(connections).set({ conference_stop_requested_at: new Date(), conference_stop_call_sid: callSid,
      cancel_requested_at: current.cancel_requested_at ?? new Date(), state: current.state === "active" ? "failed" : current.state,
      lease_expires_at: new Date(), updated_at: new Date(),
    }).where(eq(connections.id, current.id)).returning();
    if (!saved) throw new Error("Owned conference stop was not saved");
    return saved;
  });
}

/** A worker can finish the same saved room; it cannot inherit another lease. */
export async function readPendingVoiceAudioConferenceStop(owner: VoiceAudioConnection) {
  return withVoiceAudioConnection(owner, async (_tx, current) => {
    if (current.lease_token !== owner.lease_token || !hasUnfinishedVoiceAudioConferenceStop(current)) return null;
    if (!current.conference_sid || current.conference_sid !== owner.conference_sid || !current.conference_stop_call_sid)
      throw new VoiceAudioBindingError("Owned conference stop identity changed");
    return current;
  });
}

export async function finishVoiceAudioConferenceStop(owner: VoiceAudioConnection) {
  return withVoiceAudioConnection(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || !hasUnfinishedVoiceAudioConferenceStop(current)) return null;
    const [saved] = await tx.update(connections).set({ conference_stopped_at: new Date(), updated_at: new Date() })
      .where(eq(connections.id, current.id)).returning();
    if (!saved) throw new Error("Owned conference stop acknowledgement was not saved");
    return saved;
  });
}

export async function deferVoiceAudioConferenceStop(owner: VoiceAudioConnection) {
  await withVoiceAudioConnection(owner, async (tx, current) => {
    if (current.lease_token !== owner.lease_token || !hasUnfinishedVoiceAudioConferenceStop(current)) return;
    await tx.update(connections).set({ lease_expires_at: new Date(Date.now() + 5000), updated_at: new Date() })
      .where(eq(connections.id, current.id));
  });
}

import { VOICE_AUDIO_ACTOR_HEADER } from "./voice-audio-connection";
import { voiceDialerStopSnapshotSchema } from "./schemas/api/voice-dialer-stop";
import type { DialerJournal } from "./predictive-dialer-journal";

export async function stopDialerRequest(journal: DialerJournal, keepalive = false) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/auto-dial/end", { method: "POST", credentials: "same-origin", redirect: "error", keepalive,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: journal.userId },
      body: JSON.stringify({ workspaceId: journal.workspaceId, campaignId: journal.campaignId, dial_intent_id: journal.intentId,
        ...(journal.conference ? { conferenceName: journal.conference } : {}) }) });
    const result = voiceDialerStopSnapshotSchema.safeParse(await response.json());
    if (!result.success) return null;
    const saved = result.data;
    if (saved.workspace_id !== journal.workspaceId || saved.user_id !== journal.userId || String(saved.campaign_id) !== journal.campaignId ||
      saved.intent_id !== journal.intentId || journal.conference && saved.conference_id !== journal.conference ||
      response.status !== (saved.stop_state === "stopped" ? 200 : 202)) return null;
    return saved;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

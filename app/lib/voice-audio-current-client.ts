import { voiceAudioCurrentSnapshotSchema, type VoiceAudioCurrentSnapshot, type VoiceAudioIntentSnapshot } from "@/lib/schemas/api/voice-audio";
import { voiceAudioConnectRequestSchema, type VoiceAudioConnectRequest, type VoiceAudioOwner } from "@/lib/voice-audio-client";
import { sameVoiceAudioRequest, VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";
import { isObject } from "@/lib/type-safety-utils";

export async function readCurrentVoiceAudio(owner: VoiceAudioOwner): Promise<VoiceAudioCurrentSnapshot | null> {
  try {
    const query = new URLSearchParams({ workspaceId: owner.workspaceId, current: "1" });
    const response = await fetch(`/api/connect-phone-device?${query}`, { method: "GET", credentials: "same-origin", cache: "no-store",
      redirect: "error", headers: { Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: owner.userId } });
    const body: unknown = await response.json(), parsed = voiceAudioCurrentSnapshotSchema.safeParse(body);
    if (!response.ok || !parsed.success || parsed.data.workspace_id !== owner.workspaceId || parsed.data.user_id !== owner.userId ||
      isObject(body) && "error" in body) return null;
    return [parsed.data.active, parsed.data.pending].every(intent => !intent || currentVoiceAudioRequest(owner, intent)) ? parsed.data : null;
  } catch { return null; }
}

export function matchesCurrentVoiceAudioRequest(request: VoiceAudioConnectRequest, intent: VoiceAudioIntentSnapshot) {
  return request.workspaceId === intent.workspace_id && request.connection_intent_id === intent.connection_intent_id && intent.request !== null &&
    sameVoiceAudioRequest(intent.request, { transport: request.device ?? "phone", destination: request.phoneNumber ?? null,
      callSid: request.callSid ?? null, expectedAgentSid: request.expected_agent_sid ?? null, campaignId: request.campaignId ?? null });
}

/** Rebuild the server's immutable request; never generate a replacement nonce. */
export function currentVoiceAudioRequest(owner: VoiceAudioOwner, intent: VoiceAudioIntentSnapshot) {
  const request = intent.request;
  if (!request || intent.workspace_id !== owner.workspaceId || intent.user_id !== owner.userId) return null;
  const parsed = voiceAudioConnectRequestSchema.safeParse({ workspaceId: owner.workspaceId, connection_intent_id: intent.connection_intent_id,
    ...(request.transport === "phone" ? { phoneNumber: request.destination } : { device: "computer" }),
    ...(request.callSid ? { callSid: request.callSid, expected_agent_sid: request.expectedAgentSid } : request.campaignId ? { campaignId: request.campaignId } : {}) });
  return parsed.success ? Object.freeze(parsed.data) : null;
}

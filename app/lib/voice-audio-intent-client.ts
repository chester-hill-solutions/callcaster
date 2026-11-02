import { voiceAudioConnectRequestSchema, type VoiceAudioConnectRequest, type VoiceAudioOwner } from "@/lib/voice-audio-client";
import { voiceAudioIntentSnapshotSchema, type VoiceAudioIntentSnapshot, type VoiceAudioRequestIdentity } from "@/lib/schemas/api/voice-audio";
import { sameVoiceAudioRequest, VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";
import { isObject } from "@/lib/type-safety-utils";

export type VoiceAudioIntentClientResult =
  | { ok: true; intent: VoiceAudioIntentSnapshot }
  | { ok: false; kind: "refused" | "unverified" | "unavailable"; status: number | null };

/** Reads and cancellation never replay POST, including after a lost reply. */
async function controlIntent(owner: VoiceAudioOwner, request: VoiceAudioConnectRequest, method: "GET" | "DELETE", signal?: AbortSignal): Promise<VoiceAudioIntentClientResult> {
  const parsed = voiceAudioConnectRequestSchema.safeParse(request);
  if (!owner.userId || !parsed.success || parsed.data.workspaceId !== owner.workspaceId) return { ok: false, kind: "unverified", status: null };
  const input = parsed.data;
  const expected: VoiceAudioRequestIdentity = { transport: input.device ?? "phone", destination: input.phoneNumber ?? null,
    callSid: input.callSid ?? null, expectedAgentSid: input.expected_agent_sid ?? null, campaignId: input.campaignId ?? null };
  const query = new URLSearchParams({ workspaceId: owner.workspaceId, connection_intent_id: input.connection_intent_id });
  try {
    const response = await fetch(`/api/connect-phone-device?${query}`, { method, signal, credentials: "same-origin", cache: "no-store",
      redirect: "error", headers: { Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: owner.userId } });
    let body: unknown;
    try { body = await response.json(); }
    catch { return { ok: false, kind: "unverified", status: response.status }; }
    if (!response.ok) return { ok: false, kind: "refused", status: response.status };
    const result = voiceAudioIntentSnapshotSchema.safeParse(body);
    if (!result.success) return { ok: false, kind: "unverified", status: response.status };
    const value = result.data;
    if (value.workspace_id !== owner.workspaceId || value.user_id !== owner.userId || value.connection_intent_id !== input.connection_intent_id ||
      value.request && !sameVoiceAudioRequest(expected, value.request) || isObject(body) && "error" in body)
      return { ok: false, kind: "unverified", status: response.status };
    return { ok: true, intent: value };
  } catch { return { ok: false, kind: "unavailable", status: null }; }
}

export function readVoiceAudioIntent(owner: VoiceAudioOwner, request: VoiceAudioConnectRequest, signal?: AbortSignal) {
  return controlIntent(owner, request, "GET", signal);
}

export function cancelVoiceAudioIntent(owner: VoiceAudioOwner, request: VoiceAudioConnectRequest, signal?: AbortSignal) {
  return controlIntent(owner, request, "DELETE", signal);
}

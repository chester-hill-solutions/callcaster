export const PENDING_VOICE_AUDIO_STATES = ["prepared", "creating", "joining", "ready", "switching"] as const;
export const RECOVERABLE_VOICE_AUDIO_STATES = [...PENDING_VOICE_AUDIO_STATES, "active"] as const;

export type VoiceAudioConnectionInput = {
  workspaceId: string;
  userId: string;
  intentId: string;
  transport: "phone" | "computer";
  phoneNumber?: string;
  callSid?: string;
  expectedAgentSid?: string;
  campaignId?: number;
};

export type VoiceAudioFailureReason =
  | "workspace_not_found" | "workspace_unavailable" | "agent_not_found"
  | "target_not_found" | "target_inactive" | "handoff_unavailable"
  | "device_not_verified" | "caller_id_unavailable" | "account_changed"
  | "insufficient_credits" | "connection_pending" | "intent_conflict" | "stale_audio";

export function voiceAudioRefusal(reason: VoiceAudioFailureReason) {
  return { ok: false as const, reason };
}

export function voiceAudioOperationUrl(baseUrl: string, connectionId: string, event: "voice" | "status" | "conference" | "customer") {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/voice-audio`);
  url.searchParams.set("connection", connectionId);
  url.searchParams.set("event", event);
  return url.href;
}

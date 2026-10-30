export const PENDING_VOICE_AUDIO_STATES = ["prepared", "creating", "joining", "ready", "switching"] as const;
export const RECOVERABLE_VOICE_AUDIO_STATES = [...PENDING_VOICE_AUDIO_STATES, "active"] as const;

export class VoiceAudioBindingError extends Error {
  constructor(message: string) { super(message); this.name = "VoiceAudioBindingError"; }
}

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
  | "insufficient_credits" | "connection_pending" | "intent_conflict" | "stale_audio"
  | "active_customer_audio" | "handoff_in_progress" | "connection_not_found";

export function voiceAudioRefusal(reason: VoiceAudioFailureReason) {
  return { ok: false as const, reason };
}

export function voiceAudioParticipantLabel(row: { id: string; generation: number }) {
  return `audio:${row.id}:${row.generation}`;
}

export function voiceAudioCustomerLabel(reservationId: string) {
  return `customer:${reservationId}`;
}

export function voiceAudioStartsMuted(row: { target_kind: string; source_agent_sid: string | null }) {
  return row.target_kind !== "idle" || row.source_agent_sid !== null;
}

export function voiceAudioOperationUrl(baseUrl: string, connectionId: string, event: "voice" | "status" | "conference" | "customer") {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/voice-audio`);
  url.searchParams.set("connection", connectionId);
  url.searchParams.set("event", event);
  return url.href;
}

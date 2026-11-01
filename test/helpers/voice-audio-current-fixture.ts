import type { AgentAudioStorage } from "@/lib/agent-audio-storage";
import type { VoiceAudioIntentSnapshot, VoiceAudioRequestIdentity, VoiceAudioSnapshot } from "@/lib/schemas/api/voice-audio";

export const owner = { workspaceId: "10000000-0000-4000-8000-000000000001", userId: "audio-recovery-agent" };
export const phone = "+16135550123", nextPhone = "+16135550124";
export const firstId = "20000000-0000-4000-8000-000000000001", nextId = "20000000-0000-4000-8000-000000000002";
export const firstRequest = { workspaceId: owner.workspaceId, phoneNumber: phone, connection_intent_id: firstId };
export const nextRequest = { workspaceId: owner.workspaceId, phoneNumber: nextPhone, connection_intent_id: nextId };

export function intent(id = firstId, destination = phone, connection_state: VoiceAudioSnapshot["connection_state"] = "active"):
  VoiceAudioIntentSnapshot & { request: VoiceAudioRequestIdentity; connection: VoiceAudioSnapshot } {
  return { workspace_id: owner.workspaceId, user_id: owner.userId, connection_intent_id: id, intent_state: "bound",
    request: { transport: "phone", destination, callSid: null, expectedAgentSid: null, campaignId: null },
    connection: { workspace_id: owner.workspaceId, user_id: owner.userId, connection_id: id.replace("20000000", "30000000"),
      connection_intent_id: id, control_intent_id: id, connection_state, destination, transport: "phone", generation: id === firstId ? 1 : 2,
      callSid: `CA${id === firstId ? "1".repeat(32) : "2".repeat(32)}`, requested_call_sid: null, source_agent_sid: null, campaign_id: null, cancel_requested: false } };
}

export function current(active: ReturnType<typeof intent> | null = null, pending: ReturnType<typeof intent> | null = null) {
  return { workspace_id: owner.workspaceId, user_id: owner.userId, active, pending, recovery_required: false, customer_pending: false,
    predictive: { revision: "0", customer: null }, manual: null };
}

export function memoryStorage(): AgentAudioStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

import { z } from "zod";
import { connectPhoneDeviceBodySchema } from "@/lib/schemas/api/common";
import { voiceAudioAcceptedSchema, voiceAudioSnapshotSchema, type VoiceAudioSnapshot } from "@/lib/schemas/api/voice-audio";
import { VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";

export const voiceAudioConnectRequestSchema = connectPhoneDeviceBodySchema.safeExtend({ connection_intent_id: z.uuid() });
export type VoiceAudioConnectRequest = z.infer<typeof voiceAudioConnectRequestSchema>;
export type VoiceAudioOwner = { workspaceId: string; userId: string };
export type VoiceAudioClientResult =
  | { ok: true; connection: VoiceAudioSnapshot }
  | { ok: false; kind: "refused" | "unverified" | "unavailable"; status: number | null; connection?: VoiceAudioSnapshot };

function ownsConnection(owner: VoiceAudioOwner, connection: VoiceAudioSnapshot) {
  return connection.workspace_id === owner.workspaceId && connection.user_id === owner.userId;
}

function matchesRequest(request: VoiceAudioConnectRequest, connection: VoiceAudioSnapshot) {
  const transport = request.device ?? "phone";
  return connection.control_intent_id === request.connection_intent_id && connection.transport === transport && (transport !== "phone" || connection.destination === request.phoneNumber) &&
    connection.requested_call_sid === (request.callSid ?? null) &&
    (request.callSid ? connection.source_agent_sid === request.expected_agent_sid : connection.campaign_id === (request.campaignId ?? null));
}

/** A poll/cancel reply cannot adopt a different attempt, generation or physical leg. */
export function matchesVoiceAudioConnection(saved: VoiceAudioSnapshot, next: VoiceAudioSnapshot) {
  const terminal = ["failed", "canceled", "retired"].includes(saved.connection_state);
  if (terminal && saved.connection_state !== next.connection_state || saved.cancel_requested && !next.cancel_requested) return false;
  return saved.connection_id === next.connection_id && saved.connection_intent_id === next.connection_intent_id && saved.control_intent_id === next.control_intent_id &&
    saved.generation === next.generation && saved.transport === next.transport && saved.destination === next.destination &&
    saved.requested_call_sid === next.requested_call_sid && saved.campaign_id === next.campaign_id && saved.source_agent_sid === next.source_agent_sid &&
    (saved.callSid === null || saved.callSid === next.callSid);
}

async function requestConnection(owner: VoiceAudioOwner, init: RequestInit, matches: (connection: VoiceAudioSnapshot) => boolean, query = ""): Promise<VoiceAudioClientResult> {
  try {
    const response = await fetch(`/api/connect-phone-device${query}`, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error" });
    let body: unknown;
    try { body = await response.json(); }
    catch { return { ok: false, kind: "unverified", status: response.status }; }
    const parsed = voiceAudioSnapshotSchema.safeParse(body);
    if (parsed.success && (!ownsConnection(owner, parsed.data) || !matches(parsed.data)))
      return { ok: false, kind: "unverified", status: response.status };
    if (!response.ok) {
      const hasSnapshot = typeof body === "object" && body !== null && "connection_id" in body;
      if (hasSnapshot && !parsed.success) return { ok: false, kind: "unverified", status: response.status };
      return { ok: false, kind: "refused", status: response.status, ...(parsed.success ? { connection: parsed.data } : {}) };
    }
    const accepted = init.method === "POST" ? voiceAudioAcceptedSchema.safeParse(body).success : parsed.success;
    const hasError = typeof body === "object" && body !== null && "error" in body;
    return parsed.success && accepted && !hasError ? { ok: true, connection: parsed.data } : { ok: false, kind: "unverified", status: response.status };
  } catch { return { ok: false, kind: "unavailable", status: null }; }
}

/** Callers retain this request and intent unchanged when the reply is unknown. */
export async function connectVoiceAudio(owner: VoiceAudioOwner, request: VoiceAudioConnectRequest, signal?: AbortSignal): Promise<VoiceAudioClientResult> {
  const parsed = voiceAudioConnectRequestSchema.safeParse(request);
  if (!owner.userId || !parsed.success || parsed.data.workspaceId !== owner.workspaceId) return { ok: false, kind: "unverified", status: null };
  return requestConnection(owner, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: owner.userId },
    body: JSON.stringify(parsed.data), signal }, (connection) => matchesRequest(parsed.data, connection));
}

async function controlVoiceAudio(owner: VoiceAudioOwner, saved: VoiceAudioSnapshot, method: "GET" | "DELETE", signal?: AbortSignal): Promise<VoiceAudioClientResult> {
  const parsed = voiceAudioSnapshotSchema.safeParse(saved);
  if (!parsed.success || !ownsConnection(owner, parsed.data)) return { ok: false, kind: "unverified", status: null };
  const query = new URLSearchParams({ workspaceId: owner.workspaceId, connection_id: parsed.data.connection_id, control_intent_id: parsed.data.control_intent_id });
  return requestConnection(owner, { method, headers: { Accept: "application/json", [VOICE_AUDIO_ACTOR_HEADER]: owner.userId }, signal }, (connection) => matchesVoiceAudioConnection(parsed.data, connection), `?${query}`);
}

export function readVoiceAudio(owner: VoiceAudioOwner, saved: VoiceAudioSnapshot, signal?: AbortSignal) {
  return controlVoiceAudio(owner, saved, "GET", signal);
}

export function cancelVoiceAudio(owner: VoiceAudioOwner, saved: VoiceAudioSnapshot, signal?: AbortSignal) {
  return controlVoiceAudio(owner, saved, "DELETE", signal);
}

export function isVoiceAudioEffective(connection: VoiceAudioSnapshot) {
  return connection.connection_state === "active" && !connection.cancel_requested && connection.callSid !== null;
}

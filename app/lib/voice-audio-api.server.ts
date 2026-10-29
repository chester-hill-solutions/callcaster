import { findVoiceAudioConnection, type VoiceAudioConnection } from "@/server/voice-audio-connection.server";
import type { VoiceAudioFailureReason } from "@/lib/voice-audio-connection";
import { OUTBOUND_CREDITS_BLOCKED_BODY } from "@/lib/outbound-credit-gate.server";
import { voiceAudioConnectionQuerySchema } from "@/lib/schemas/api/common";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { dispatchVoiceAudioConnection, VoiceAudioConnectionPendingError } from "@/lib/voice-audio-dispatch.server";
import { attemptVoiceAudioCancellation } from "@/lib/voice-audio-recovery.server";
import { logger } from "@/lib/logger.server";

export function voiceAudioSnapshot(row: VoiceAudioConnection) {
  return { connection_id: row.id, connection_state: row.state, callSid: row.provider_sid, source_agent_sid: row.source_agent_sid,
    generation: row.generation, transport: row.transport, cancel_requested: Boolean(row.cancel_requested_at) };
}

export function voiceAudioFailureResponse(reason: VoiceAudioFailureReason, headers?: HeadersInit) {
  if (reason === "insufficient_credits") return Response.json(OUTBOUND_CREDITS_BLOCKED_BODY, { status: 402, headers });
  if (["workspace_not_found", "agent_not_found", "target_not_found", "connection_not_found"].includes(reason))
    return Response.json({ error: "Workspace, audio connection or call not found" }, { status: 404, headers });
  if (reason === "device_not_verified") return Response.json({ error: "Device is not verified for this user" }, { status: 403, headers });
  if (reason === "workspace_unavailable") return Response.json({ error: "Workspace is not available for outbound calls" }, { status: 403, headers });
  if (reason === "caller_id_unavailable") return Response.json({ error: "Workspace has no usable caller ID" }, { status: 400, headers });
  return Response.json({ error: "Audio change cannot proceed. Keep the current audio and check the saved connection.", reason }, { status: 409, headers });
}

export function parseVoiceAudioQuery(request: Request) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some((key) => query.getAll(key).length !== 1)) return null;
  const result = voiceAudioConnectionQuerySchema.safeParse(Object.fromEntries(query.entries()));
  return result.success ? result.data : null;
}

function pendingResponse(row: VoiceAudioConnection, headers?: HeadersInit) {
  return Response.json({ error: "Agent audio connection is awaiting provider verification", reason: "voice_audio_pending",
    ...voiceAudioSnapshot(row) }, { status: 409, headers });
}

export async function sendVoiceAudioApiResponse(row: VoiceAudioConnection, headers?: HeadersInit) {
  if (row.provider_sid) return Response.json({ success: true, ...voiceAudioSnapshot(row) }, { headers });
  if (["failed", "canceled", "retired"].includes(row.state)) return voiceAudioFailureResponse("stale_audio", headers);
  if (row.send_started_at) return pendingResponse(row, headers);
  if (row.state !== "prepared") return voiceAudioFailureResponse("stale_audio", headers);
  try {
    const client = await createWorkspaceTwilioInstance({ workspace_id: row.workspace });
    if (client.accountSid !== row.account_sid) return voiceAudioFailureResponse("account_changed", headers);
    const result = await dispatchVoiceAudioConnection(row, (saved) => client.calls.create({ to: saved.destination, from: saved.caller_id,
      url: saved.voice_url, method: "POST", statusCallback: saved.status_callback, statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    }));
    if (!result.ok) return voiceAudioFailureResponse(result.reason, headers);
    const connection = await attemptVoiceAudioCancellation(result.connection);
    return Response.json({ success: true, ...voiceAudioSnapshot(connection) }, { headers });
  } catch (error) {
    if (error instanceof VoiceAudioConnectionPendingError) {
      const current = { ...row, state: "creating" as const };
      try { const saved = await findVoiceAudioConnection(row.id); if (saved) return pendingResponse(saved, headers); }
      catch (readError) { logger.error("voice_audio.pending_read_failed", { connectionId: row.id, error: readError }); }
      return pendingResponse(current, headers);
    }
    logger.error("voice_audio.connection_failed", { connectionId: row.id, error });
    return Response.json({ error: "Unable to connect the agent device" }, { status: 502, headers });
  }
}

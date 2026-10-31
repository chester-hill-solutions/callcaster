import { z } from "zod";

const callSid = z.string().regex(/^CA[0-9a-f]{32}$/i);

/** Session-only connection response. Keep in sync with openapi-voice-audio.ts. */
export const voiceAudioSnapshotSchema = z.object({
  connection_id: z.uuid(),
  connection_state: z.enum(["prepared", "creating", "joining", "ready", "switching", "active", "retired", "failed", "canceled"]),
  workspace_id: z.uuid(),
  user_id: z.string().min(1),
  connection_intent_id: z.uuid(),
  control_intent_id: z.uuid(),
  destination: z.string().min(1),
  requested_call_sid: callSid.nullable(),
  campaign_id: z.number().int().positive().nullable(),
  callSid: callSid.nullable(),
  source_agent_sid: callSid.nullable(),
  generation: z.number().int().positive(),
  transport: z.enum(["phone", "computer"]),
  cancel_requested: z.boolean(),
}).superRefine((snapshot, ctx) => {
  if (snapshot.connection_state === "active" && !snapshot.callSid)
    ctx.addIssue({ code: "custom", message: "Active audio requires its provider call", path: ["callSid"] });
  const validDestination = snapshot.transport === "phone" ? /^\+[1-9]\d{1,14}$/.test(snapshot.destination) : /^client:\S+$/.test(snapshot.destination);
  if (!validDestination) ctx.addIssue({ code: "custom", message: "Destination does not match the audio transport", path: ["destination"] });
});

export type VoiceAudioSnapshot = z.infer<typeof voiceAudioSnapshotSchema>;

export const voiceAudioAcceptedSchema = voiceAudioSnapshotSchema.safeExtend({ success: z.literal(true) });

export const voiceAudioRequestIdentitySchema = z.object({
  transport: z.enum(["phone", "computer"]), destination: z.string().nullable(), callSid: callSid.nullable(),
  expectedAgentSid: callSid.nullable(), campaignId: z.number().int().positive().nullable(),
}).superRefine((request, ctx) => {
  if ((request.transport === "phone" ? !request.destination || !/^\+[1-9]\d{1,14}$/.test(request.destination) : request.destination !== null) ||
    (request.callSid ? !request.expectedAgentSid || request.campaignId !== null : request.expectedAgentSid !== null || request.transport === "computer"))
    ctx.addIssue({ code: "custom", message: "Audio request context is invalid" });
});
export type VoiceAudioRequestIdentity = z.infer<typeof voiceAudioRequestIdentitySchema>;

function matchesAudioIntentContext(request: VoiceAudioRequestIdentity, connection: VoiceAudioSnapshot) {
  if (request.transport !== connection.transport || request.callSid !== connection.requested_call_sid) return false;
  if (request.transport === "phone" && request.destination !== connection.destination) return false;
  return request.callSid ? request.expectedAgentSid === connection.source_agent_sid : request.campaignId === connection.campaign_id;
}

export const voiceAudioIntentSnapshotSchema = z.object({
  workspace_id: z.uuid(), user_id: z.string().min(1), connection_intent_id: z.uuid(),
  intent_state: z.enum(["bound", "canceled", "superseded"]),
  request: voiceAudioRequestIdentitySchema.nullable(), connection: voiceAudioSnapshotSchema.nullable(),
}).superRefine((value, ctx) => {
  const invalid = () => ctx.addIssue({ code: "custom", message: "Audio request does not own this connection", path: ["connection"] });
  const connection = value.connection;
  if (value.intent_state === "bound" && (!connection || !value.request)) invalid();
  if (value.intent_state === "superseded" && connection) invalid();
  if (!connection) return;
  if (connection.workspace_id !== value.workspace_id || connection.user_id !== value.user_id ||
    connection.control_intent_id !== value.connection_intent_id || !value.request || !matchesAudioIntentContext(value.request, connection)) invalid();
  if (value.intent_state === "canceled" && !connection.cancel_requested && !["canceled", "failed", "retired"].includes(connection.connection_state)) invalid();
});
export type VoiceAudioIntentSnapshot = z.infer<typeof voiceAudioIntentSnapshotSchema>;

function matchesCurrentAudioRole(owner: { workspace_id: string; user_id: string }, intent: VoiceAudioIntentSnapshot, role: "active" | "pending") {
  const connection = intent.connection;
  if (intent.workspace_id !== owner.workspace_id || intent.user_id !== owner.user_id || !connection) return false;
  return role === "active" ? connection.connection_state === "active" : ["prepared", "creating", "joining", "ready", "switching"].includes(connection.connection_state);
}

/** A server read, never authority to send a customer or change a control owner. */
export const voiceAudioCurrentSnapshotSchema = z.object({
  workspace_id: z.uuid(), user_id: z.string().min(1),
  active: voiceAudioIntentSnapshotSchema.nullable(), pending: voiceAudioIntentSnapshotSchema.nullable(),
  recovery_required: z.boolean(), customer_pending: z.boolean(),
}).superRefine((value, ctx) => {
  for (const name of ["active", "pending"] as const) {
    const intent = value[name];
    if (!intent) continue;
    if (!matchesCurrentAudioRole(value, intent, name))
      ctx.addIssue({ code: "custom", message: "Current audio does not match its owner or role", path: [name] });
  }
  if (value.active && value.pending && (value.active.connection_intent_id === value.pending.connection_intent_id ||
    value.active.connection?.connection_id === value.pending.connection?.connection_id))
    ctx.addIssue({ code: "custom", message: "Current audio roles must have distinct owners", path: ["pending"] });
  if (!value.recovery_required && (value.active?.connection?.cancel_requested || value.pending?.connection?.cancel_requested))
    ctx.addIssue({ code: "custom", message: "Canceled audio requires recovery", path: ["recovery_required"] });
});
export type VoiceAudioCurrentSnapshot = z.infer<typeof voiceAudioCurrentSnapshotSchema>;

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
});
export type VoiceAudioRequestIdentity = z.infer<typeof voiceAudioRequestIdentitySchema>;

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
    connection.control_intent_id !== value.connection_intent_id || !value.request || connection.transport !== value.request.transport) invalid();
  if (value.request?.transport === "phone" && value.request.destination !== connection.destination) invalid();
  if (value.intent_state === "canceled" && !connection.cancel_requested && !["canceled", "failed", "retired"].includes(connection.connection_state)) invalid();
});
export type VoiceAudioIntentSnapshot = z.infer<typeof voiceAudioIntentSnapshotSchema>;

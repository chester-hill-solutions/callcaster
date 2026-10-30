import { z } from "zod";

const callSid = z.string().regex(/^CA[0-9a-f]{32}$/i);

/** Session-only connection response. Keep in sync with openapi-voice-audio.ts. */
export const voiceAudioSnapshotSchema = z.object({
  connection_id: z.uuid(),
  connection_state: z.enum(["prepared", "creating", "joining", "ready", "switching", "active", "retired", "failed", "canceled"]),
  workspace_id: z.uuid(),
  user_id: z.string().min(1),
  connection_intent_id: z.uuid(),
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

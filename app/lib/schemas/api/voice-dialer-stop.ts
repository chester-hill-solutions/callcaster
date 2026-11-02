import { z } from "zod";

export const voiceDialerStopBodySchema = z.object({
  workspaceId: z.uuid(), campaignId: z.union([z.number(), z.string().regex(/^[1-9]\d*$/)]).transform(Number).pipe(z.number().int().positive().safe()),
  dial_intent_id: z.uuid().transform(value => value.toLowerCase()),
  conferenceName: z.string().min(1).optional(),
}).strict();
export const voiceDialerStopSnapshotSchema = z.object({
  success: z.literal(true), workspace_id: z.uuid(), user_id: z.string().min(1), campaign_id: z.number().int().positive().safe(),
  intent_id: z.uuid(), conference_id: z.string().min(1).nullable(), stop_state: z.enum(["pending", "stopped"]),
}).strict();
export type VoiceDialerStopBody = z.infer<typeof voiceDialerStopBodySchema>;
export type VoiceDialerStopSnapshot = z.infer<typeof voiceDialerStopSnapshotSchema>;

/** Read-only session control; the customer snapshot keeps its own lifecycle. */
export const voiceDialerCurrentSchema = z.object({
  workspace_id: z.uuid(), user_id: z.string().min(1), campaign_id: z.number().int().positive().safe(),
  intent_id: z.uuid(), conference_id: z.string().min(1).nullable(), dialer_state: z.enum(["active", "stopping"]),
}).superRefine((value, ctx) => {
  if (value.dialer_state === "active" && !value.conference_id)
    ctx.addIssue({ code: "custom", message: "An active dialer requires its saved room" });
});
export type VoiceDialerCurrent = z.infer<typeof voiceDialerCurrentSchema>;

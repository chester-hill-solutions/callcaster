import { z } from "zod";
import { workspaceIdSchema } from "@/lib/schemas/api/common";

const scriptCampaignTypes = [
  "live_call",
  "robocall",
  "simple_ivr",
  "complex_ivr",
] as const;

export const createWithScriptBodySchema = z
  .object({
    workspace_id: workspaceIdSchema.optional(),
    title: z.string().min(1),
    type: z.enum(scriptCampaignTypes),
    caller_id: z.string().min(1),
    script: z
      .object({
        name: z.string().min(1),
        type: z.string().optional(),
        steps: z.record(z.string(), z.unknown()),
      })
      .optional(),
    script_id: z.number().int().positive().optional(),
    audience_ids: z.array(z.number().int().positive()).optional(),
    status: z.string().optional(),
    enqueue_audience_contacts: z.boolean().optional(),
    is_active: z.boolean().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    schedule: z.unknown().optional(),
  })
  .refine((body) => body.script != null || body.script_id != null, {
    message: "Either script or script_id is required",
    path: ["script"],
  })
  .refine((body) => !(body.script != null && body.script_id != null), {
    message: "Provide exactly one of script or script_id, not both",
    path: ["script_id"],
  });

export type CreateWithScriptBody = z.infer<typeof createWithScriptBodySchema>;

import { z } from "zod";
import { workspaceIdSchema } from "@/lib/schemas/api/common";

const scriptCampaignTypes = ["live_call", "robocall"] as const;
const legacyIvrCampaignTypes = new Set(["simple_ivr", "complex_ivr"]);

export const createWithScriptBodySchema = z
  .object({
    workspace_id: workspaceIdSchema.optional(),
    title: z.string().min(1),
    type: z.enum(scriptCampaignTypes, {
      error: (issue) =>
        typeof issue.input === "string" && legacyIvrCampaignTypes.has(issue.input)
          ? `"${issue.input}" is no longer supported; use "robocall" instead`
          : 'Campaign type must be "live_call" or "robocall"',
    }),
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
    // Deprecated: accepted for compatibility, ignored — derived from status (#1216).
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

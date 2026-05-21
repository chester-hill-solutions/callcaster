import { z } from "zod";
import { coerceEntityIdSchema, workspaceIdSchema } from "@/lib/schemas/api/common";

export const dialBodySchema = z.object({
  to_number: z.string().min(1),
  user_id: z.string().min(1),
  campaign_id: z.string().min(1),
  contact_id: z.string().min(1),
  workspace_id: z.string().min(1),
  queue_id: z.string().min(1),
  caller_id: z.string().min(1),
  outreach_id: z.string().optional(),
  selected_device: z.string().optional(),
});

export const hangupBodySchema = z.object({
  conference_id: z.string().optional(),
  workspaceId: z.string().min(1),
  callSid: z.string().min(1),
});

export const audiencePatchBodySchema = z
  .object({
    id: coerceEntityIdSchema,
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const audienceDeleteBodySchema = z.object({
  id: coerceEntityIdSchema,
});

export const contactAudienceDeleteSchema = z.object({
  contact_id: coerceEntityIdSchema,
  audience_id: coerceEntityIdSchema,
});

export const contactAudienceBulkDeleteSchema = z.object({
  contact_ids: z.array(coerceEntityIdSchema).min(1),
  audience_id: coerceEntityIdSchema,
});

export const autoDialBodySchema = z.object({
  user_id: z.unknown().optional(),
  caller_id: z.string().min(1),
  workspace_id: z.string().min(1),
  campaign_id: z.union([z.string(), z.number()]).optional(),
  selected_device: z.union([z.string(), z.number()]).optional(),
});

export const autoDialDialerBodySchema = z.object({
  user_id: z.string().min(1),
  campaign_id: z.coerce.number().int().positive(),
  workspace_id: z.string().min(1),
  selected_device: z.string().min(1),
});

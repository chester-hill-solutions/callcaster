import { z } from "zod";

/** Workspace UUID used across authenticated API routes. */
export const workspaceIdSchema = z.uuid();

/** Positive integer ID (campaign, contact, queue, audience, etc.). */
export const entityIdSchema = z.coerce.number().int().positive();

/** Non-empty string ID fields that may arrive as string or number from clients. */
export const coerceEntityIdSchema = z.union([
  z.number().int().positive(),
  z.string().transform((s, ctx) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: "Invalid id" });
      return z.NEVER;
    }
    return n;
  }),
]);

export const campaignAudienceBodySchema = z.object({
  audience_id: coerceEntityIdSchema,
  campaign_id: coerceEntityIdSchema,
});

export const outreachAttemptBodySchema = z.object({
  campaign_id: coerceEntityIdSchema,
  contact_id: coerceEntityIdSchema,
  queue_id: coerceEntityIdSchema,
});

export const queueDequeueBodySchema = z.object({
  contact_id: coerceEntityIdSchema,
  household: z.boolean(),
});

export const queueResetBodySchema = z.object({
  campaignId: z.union([z.string(), z.number()]).transform(String),
});

export const initiateIvrBodySchema = z.object({
  campaign_id: entityIdSchema,
  user_id: z.object({ id: z.string().min(1) }),
  workspace_id: workspaceIdSchema,
});

export const connectPhoneDeviceBodySchema = z.object({
  phoneNumber: z.string().min(1),
  workspaceId: workspaceIdSchema,
  campaignId: coerceEntityIdSchema,
});

export const testWebhookBodySchema = z.object({
  event: z.string().min(1),
  destination_url: z.union([z.string(), z.number()]),
  custom_headers: z.string(),
});

export const autoDialEndBodySchema = z.object({
  workspaceId: workspaceIdSchema,
});

export const workspaceUpdateBodySchema = z.object({
  workspace_id: workspaceIdSchema,
  update: z.record(z.string(), z.unknown()).optional(),
});

export const numbersPurchaseBodySchema = z.object({
  phoneNumber: z.string().min(1),
  workspace_id: workspaceIdSchema,
});

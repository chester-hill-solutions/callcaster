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

export const connectPhoneDeviceBodySchema = z.strictObject({
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{1,14}$/).optional(),
  device: z.enum(["phone", "computer"]).optional(),
  workspaceId: workspaceIdSchema,
  campaignId: coerceEntityIdSchema.optional(),
  callSid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
  expected_agent_sid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
  connection_intent_id: z.uuid().optional(),
}).superRefine((body, ctx) => {
  const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
  if (body.device === "computer") {
    if (body.phoneNumber) issue("Computer audio does not take a phone number", "phoneNumber");
    if (!body.callSid) issue("Computer replacement requires an owned call", "callSid");
  } else if (!body.phoneNumber) issue("A verified phone number is required", "phoneNumber");
  if (body.callSid) {
    if (body.campaignId != null) issue("Choose a call or an idle campaign connection", "campaignId");
    if (!body.connection_intent_id) issue("Live replacement requires a stable intent UUID", "connection_intent_id");
    if (!body.expected_agent_sid) issue("Live replacement requires the current agent SID", "expected_agent_sid");
  } else if (body.expected_agent_sid) issue("An agent SID requires an owned call", "expected_agent_sid");
});

export const handsetDialPreparationBodySchema = z.strictObject({
  to_number: z.string().trim().min(1),
  client_identity: z.string().trim().min(1),
  dial_intent_id: z.uuid(),
});

export const testWebhookBodySchema = z.object({
  workspace_id: workspaceIdSchema.optional(),
  event: z.string().min(1),
  destination_url: z.string().url(),
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

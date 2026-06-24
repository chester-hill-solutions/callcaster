import { z } from "zod";

export const purchaseNumberBodySchema = z.object({
  phone_number: z.string().min(1),
});

export const patchNumberBodySchema = z
  .object({
    friendly_name: z.string().min(1).optional(),
    inbound_action: z.string().optional(),
    inbound_audio: z.string().nullable().optional(),
    inbound_ring_count: z.number().int().min(1).max(10).optional(),
    inbound_queue_id: z.number().int().nullable().optional(),
    inbound_script_id: z.number().int().nullable().optional(),
    handset_enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.friendly_name !== undefined ||
      value.inbound_action !== undefined ||
      value.inbound_audio !== undefined ||
      value.inbound_ring_count !== undefined ||
      value.inbound_queue_id !== undefined ||
      value.inbound_script_id !== undefined ||
      value.handset_enabled !== undefined,
    { message: "At least one number field is required." },
  );

export const inviteMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member", "caller"]),
});

export const updateMemberBodySchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "caller"]),
});

export const deleteMemberBodySchema = z.object({
  user_id: z.string().uuid(),
  target: z.enum(["member", "invite"]).optional(),
});

export const upsertWebhookBodySchema = z.object({
  destination_url: z.string().url(),
  events: z.array(z.string()).min(1),
  custom_headers: z
    .union([
      z.record(z.string(), z.string()),
      z.array(z.tuple([z.string(), z.string()])),
    ])
    .optional()
    .default({}),
  webhook_id: z.number().int().optional(),
});

export const testWebhookBodySchema = z.object({
  destination_url: z.string().url(),
  custom_headers: z
    .union([
      z.record(z.string(), z.string()),
      z.array(z.tuple([z.string(), z.string()])),
    ])
    .optional()
    .default({}),
  event: z.record(z.string(), z.unknown()),
});

export const createApiKeyBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const deleteApiKeyBodySchema = z.object({
  id: z.string().uuid(),
});

export const verifyCallerIdBodySchema = z.object({
  phone_number: z.string().min(1),
  friendly_name: z.string().min(1),
});

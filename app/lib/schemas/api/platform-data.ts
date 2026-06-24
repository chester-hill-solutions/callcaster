import { z } from "zod";

export const campaignStatusSchema = z.enum([
  "pending",
  "scheduled",
  "running",
  "complete",
  "paused",
  "draft",
  "archived",
]);

export const campaignStatusBodySchema = z.object({
  status: campaignStatusSchema,
  is_active: z.boolean().optional(),
});

export const queueFiltersSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  audiences: z.string().optional(),
  disposition: z.string().optional(),
  queueStatus: z.string().optional(),
});

export const patchCampaignQueueBodySchema = z
  .object({
    action: z.enum([
      "update_status",
      "add_contact_ids",
      "add_audience",
      "remove",
    ]),
    status: z.string().optional(),
    ids: z.array(z.number().int()).optional(),
    contact_ids: z.array(z.number().int()).optional(),
    audience_id: z.number().int().optional(),
    all: z.boolean().optional(),
    filters: queueFiltersSchema.optional(),
  })
  .refine(
    (body) => {
      switch (body.action) {
        case "update_status":
          return Boolean(body.status);
        case "add_contact_ids":
          return (body.contact_ids?.length ?? 0) > 0;
        case "add_audience":
          return body.audience_id != null;
        case "remove":
          return body.all === true || (body.ids?.length ?? 0) > 0;
        default:
          return false;
      }
    },
    { message: "Invalid queue patch payload for action" },
  );

export type PatchCampaignQueueBody = z.infer<typeof patchCampaignQueueBodySchema>;
export type CampaignStatusBody = z.infer<typeof campaignStatusBodySchema>;

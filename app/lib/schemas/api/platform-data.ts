import { z } from "zod";

export const campaignStatusSchema = z.enum([
  "pending",
  "scheduled",
  "running",
  "complete",
  "paused",
  "draft",
  "archived",
  "waiting",
]);

export const campaignStatusBodySchema = z.object({
  status: campaignStatusSchema,
  // Deprecated: accepted for compatibility, ignored — derived from status (#1216).
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

/** Which queue rows an action applies to: explicit ids, or every row matching the filters. */
const queueSelectionFields = {
  ids: z.array(z.number().int()).optional(),
  all: z.boolean().optional(),
  filters: queueFiltersSchema.optional(),
};

/**
 * One variant per action, so each action's required fields are enforced at
 * the request boundary and handlers get a narrowed body instead of guarding
 * for fields that "should" be there (roadmap E6.1).
 */
export const patchCampaignQueueBodySchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("update_status"),
      status: z.string().min(1),
      ...queueSelectionFields,
    }),
    z.object({
      action: z.literal("add_contact_ids"),
      contact_ids: z.array(z.number().int()).min(1),
    }),
    z.object({
      action: z.literal("add_audience"),
      audience_id: z.number().int(),
    }),
    z.object({
      action: z.literal("remove"),
      ...queueSelectionFields,
    }),
  ])
  .superRefine((body, ctx) => {
    if (body.action === "remove" && body.all !== true && (body.ids?.length ?? 0) === 0) {
      ctx.addIssue({
        code: "custom",
        message: "remove requires all: true or a non-empty ids list",
        path: ["ids"],
      });
    }
  });

export type PatchCampaignQueueBody = z.infer<typeof patchCampaignQueueBodySchema>;
export type CampaignStatusBody = z.infer<typeof campaignStatusBodySchema>;

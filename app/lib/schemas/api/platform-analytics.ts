import { z } from "zod";

export const campaignExportBodySchema = z.object({
  campaign_id: z.number().int().positive(),
});

export type CampaignExportBody = z.infer<typeof campaignExportBodySchema>;

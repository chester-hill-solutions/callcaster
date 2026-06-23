import { z } from "zod";
import { workspaceIdSchema } from "@/lib/schemas/api/common";

export const campaignSmsDispatchBodySchema = z.object({
  workspace_id: workspaceIdSchema,
  campaign_id: z.string().min(1),
  caller_id: z.string().optional(),
  user_id: z.string().min(1).optional(),
  message_intent: z.string().optional(),
  messaging_service_sid: z.string().optional(),
});

export type CampaignSmsDispatchBody = z.infer<typeof campaignSmsDispatchBodySchema>;

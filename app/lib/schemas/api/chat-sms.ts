import { z } from "zod";
import { workspaceIdSchema } from "@/lib/schemas/api/common";

export const chatSmsBodySchema = z.object({
  workspace_id: workspaceIdSchema,
  to_number: z.string().min(1),
  caller_id: z.string().min(1),
  body: z.string(),
  contact_id: z.string().optional(),
  media: z.string().optional(),
  message_intent: z.string().optional(),
  messaging_service_sid: z.string().optional(),
});

export type ChatSmsBody = z.infer<typeof chatSmsBodySchema>;

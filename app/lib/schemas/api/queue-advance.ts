import { z } from "zod";

const numericId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const positiveId = z.union([z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number)]).pipe(numericId);

export const queueAdvanceRequestSchema = z.object({
  workspace_id: z.string().min(1),
  contact_id: positiveId,
  campaign_id: positiveId,
  queue_id: positiveId,
  dispatch_generation: z.uuid(),
  household: z.boolean(),
  call_sid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
}).strict();

export type QueueAdvanceRequest = z.infer<typeof queueAdvanceRequestSchema>;

export const queueAdvanceResponseSchema = queueAdvanceRequestSchema.extend({
  contact_id: numericId,
  campaign_id: numericId,
  queue_id: numericId,
  success: z.literal(true),
  dequeued: z.boolean(),
  advance_state: z.enum(["dequeued", "already_dequeued", "superseded"]),
  user_id: z.string().min(1),
}).refine(value => value.dequeued === (value.advance_state === "dequeued") &&
  (value.advance_state !== "superseded" || value.call_sid !== undefined));

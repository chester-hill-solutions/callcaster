import { z } from "zod";

export const ivrNoInputSchema = z.object({
  action: z.union([
    z.enum(["next", "hangup", "replay"]),
    z.object({ pageId: z.string().min(1), blockId: z.string().min(1) }),
  ]),
  maxReplays: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});

export type IvrNoInput = z.infer<typeof ivrNoInputSchema>;

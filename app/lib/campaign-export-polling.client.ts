import * as Effect from "effect-runtime/Effect";
import { z } from "zod";
import { logger } from "@/lib/logger.client";

const exportSnapshot = z.object({
  status: z.string(),
  progress: z.number().optional(),
  downloadUrl: z.string().optional(),
  downloads: z
    .array(
      z.object({
        label: z.string(),
        filename: z.string(),
        downloadUrl: z.string(),
      }),
    )
    .optional(),
  error: z.string().optional(),
});

export type CampaignExportSnapshot = z.infer<typeof exportSnapshot>;

export function pollCampaignExport(
  url: string,
  onSnapshot: (snapshot: CampaignExportSnapshot) => void,
): () => void {
  const controller = new AbortController();
  const read = Effect.tryPromise(async (signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error(`Export status returned HTTP ${response.status}`);
    return exportSnapshot.parse(await response.json());
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.error("Error checking export status:", error);
        return null;
      }),
    ),
  );

  const poll = Effect.gen(function* () {
    yield* Effect.sleep("2 seconds");
    const snapshot = yield* read;
    if (!snapshot) return false;
    // Keep publication outside the Promise: an interrupted task must ignore a late result.
    onSnapshot(snapshot);
    return snapshot.status === "completed" || snapshot.status === "error";
  });
  void Effect.runPromise(poll.pipe(Effect.repeat({ until: (done) => done })), {
    signal: controller.signal,
  }).catch((error: unknown) => {
    if (!controller.signal.aborted)
      logger.error("Export polling stopped unexpectedly", error);
  });
  return () => controller.abort();
}

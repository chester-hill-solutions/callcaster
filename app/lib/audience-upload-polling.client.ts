import * as Effect from "effect-runtime/Effect";
import { logger } from "@/lib/logger.client";

/**
 * Run one serialized Audience Upload Status poll.
 *
 * The first read happens immediately — a small upload often finishes before the
 * first interval tick (#1078). Every later read waits `intervalMs` after the
 * previous read settles, so a slow read cannot overlap the next one. `read`
 * owns its own failure handling and must not throw; a thrown error ends the
 * task. Returns a stop function that aborts the task and its fetch.
 */
export function pollAudienceUploadStatus(args: {
  intervalMs: number;
  read: (signal: AbortSignal) => Promise<void>;
}): () => void {
  const controller = new AbortController();
  const iteration = Effect.gen(function* () {
    yield* Effect.tryPromise(() => args.read(controller.signal));
    yield* Effect.sleep(args.intervalMs);
  });
  void Effect.runPromise(Effect.forever(iteration), {
    signal: controller.signal,
  }).catch((error: unknown) => {
    if (!controller.signal.aborted)
      logger.error("Upload status polling stopped unexpectedly", error);
  });
  return () => controller.abort();
}

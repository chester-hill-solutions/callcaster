import * as Effect from "effect-runtime/Effect";
import { z } from "zod";
import {
  isTerminalStatus,
  normalizeProviderStatus,
  type CallStatusEnum,
} from "@/lib/call-status";
import { logger } from "@/lib/logger.client";

const statusResponse = z.object({
  status: z.string().nullish(),
  callSid: z.string().nullish(),
});

/**
 * Poll `/api/call-status-poll` for one committed call identity.
 *
 * The task waits `intervalMs`, reads one status, publishes it, then repeats
 * only after that read completes. Publication stays outside the wrapped
 * Promise, so an interrupted task cannot apply a late result for a call the
 * screen has already left. A terminal status ends the task.
 *
 * Returns a stop function that aborts the task and its fetch.
 */
export function pollCallStatus(
  url: string,
  intervalMs: number,
  onStatus: (status: CallStatusEnum, resolvedSid?: string) => void,
): () => void {
  const controller = new AbortController();
  const read = Effect.tryPromise(async (signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error(`Call status returned HTTP ${response.status}`);
    return statusResponse.parse(await response.json());
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.debug("Call status poll failed", error);
        return null;
      }),
    ),
  );

  const poll = Effect.gen(function* () {
    yield* Effect.sleep(intervalMs);
    const data = yield* read;
    if (!data) return false;
    const normalized = normalizeProviderStatus(data.status);
    if (!normalized) return false;
    // Keep publication outside the Promise: an interrupted task must ignore a late result.
    onStatus(normalized, data.callSid ?? undefined);
    return isTerminalStatus(normalized);
  });
  void Effect.runPromise(poll.pipe(Effect.repeat({ until: (done) => done })), {
    signal: controller.signal,
  }).catch((error: unknown) => {
    if (!controller.signal.aborted)
      logger.error("Call status polling stopped unexpectedly", error);
  });
  return () => controller.abort();
}

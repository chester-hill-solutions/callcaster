import { logger } from "@/lib/logger.server";

/**
 * Fire-and-forget a promise without losing its failure.
 *
 * Several request handlers kick off long work (campaign exports, audience
 * uploads) as `void somePromise()` and return immediately, with the client
 * polling a status blob. Left bare, a rejection becomes an unhandledRejection:
 * the web process only logs it (it does not exit — PROCESS_FATAL_ON_REJECTION
 * is unset), the status blob sits at "processing" until the 10-minute watchdog
 * rewrites it, and the single log line carries nothing to tie it back to the
 * export the customer is waiting on.
 *
 * This attaches a catch that logs the failure against identifying context, so
 * it is greppable in the JSON logs. It does NOT make the work durable — that
 * needs the job queue (see `campaign_export`'s registered worker handler).
 */
export function trackBackgroundFailure(
  promise: Promise<unknown>,
  event: string,
  context: Record<string, unknown> = {},
): void {
  void promise.catch((error: unknown) => {
    logger.error(event, {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

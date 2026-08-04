/**
 * Shared staleness policy for fire-and-forget background processing
 * (audience uploads, campaign exports) that write progress to an object
 * storage status blob rather than going through the job queue.
 *
 * These jobs are kicked off as void promises inside a request handler
 * (see app/routes/api+/audience-upload.action.server.ts and
 * app/routes/api+/campaign-export.action.server.ts). If the process
 * restarts mid-run (deploy, crash), the status blob is left at
 * status: "processing" forever and the client polls indefinitely.
 *
 * The fix is "write-through on read": the status polling loaders check
 * whether a "processing" row's last-updated timestamp is older than the
 * threshold below, and if so, rewrite the status to a terminal failure
 * before returning it to the client.
 */

/** How long a "processing" status may go without a progress update before
 * we consider it abandoned (e.g. by a mid-run restart). */
export const PROCESSING_STALE_MS = 10 * 60 * 1000;

export const PROCESSING_INTERRUPTED_MESSAGE =
  "Processing interrupted — please retry";

/**
 * Returns true when a "processing" status should be treated as abandoned.
 *
 * @param lastUpdatedIso ISO timestamp of the most recent progress write, or
 *   null/undefined if the status blob predates the heartbeat field (treated
 *   as unknown — not stale, since we cannot tell how old it is).
 */
export function isProcessingStale(
  lastUpdatedIso: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastUpdatedIso) return false;
  const lastUpdated = new Date(lastUpdatedIso).getTime();
  if (Number.isNaN(lastUpdated)) return false;
  return now.getTime() - lastUpdated > PROCESSING_STALE_MS;
}

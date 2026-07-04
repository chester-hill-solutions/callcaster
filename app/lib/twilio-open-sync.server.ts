import { logger } from "@/lib/logger.server";

/**
 * Local stub for the deleted `twilio-open-sync` Edge Function.
 *
 * The Edge Function performed a scheduled backfill of stale call/message statuses
 * from Twilio REST. This will be re-implemented as a worker job in Phase 3
 * per the v2 architecture plan.
 *
 * For now, this stub logs the request and returns an informational message.
 */
export async function triggerTwilioOpenSync({
  workspaceId,
  callLimit = 50,
  messageLimit = 50,
  maxAgeMinutes = 120,
}: {
  workspaceId: string;
  callLimit?: number;
  messageLimit?: number;
  maxAgeMinutes?: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  logger.info("Twilio open sync requested (not yet ported)", {
    workspaceId,
    callLimit,
    messageLimit,
    maxAgeMinutes,
  });

  return {
    ok: true,
    message:
      "Twilio open sync is not yet fully ported. " +
      "Stale call/message backfill will be available as a worker job in a future release.",
  };
}

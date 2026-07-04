import { eq, inArray } from "drizzle-orm";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { call, message } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";

const OPEN_CALL_STATUSES = new Set([
  "queued",
  "ringing",
  "in-progress",
  "initiated",
]);

const OPEN_MESSAGE_STATUSES = new Set([
  "accepted",
  "scheduled",
  "queued",
  "sending",
]);

/**
 * Backfill stale call/message statuses from Twilio REST for a workspace.
 * Fetches recent calls/messages with open (non-terminal) statuses from Twilio,
 * compares with local DB records, and updates any that have changed.
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
  try {
    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });

    const tdb = createTenantDb(workspaceId);
    const since = new Date(Date.now() - maxAgeMinutes * 60_000);

    // ─── Calls ─────────────────────────────────────────────
    const twilioCalls = await twilio.calls.list({
      limit: callLimit,
      pageSize: callLimit,
      startTime: since,
    });

    let callsUpdated = 0;
    let callsSkipped = 0;

    const openTwilioCalls = twilioCalls.filter((c) =>
      OPEN_CALL_STATUSES.has(c.status?.toLowerCase() ?? ""),
    );

    if (openTwilioCalls.length > 0) {
      const sids = openTwilioCalls.map((c) => c.sid);
      const localRows = await tdb.call.findMany({
        where: inArray(call.sid, sids),
      });
      const localBySid = new Map(localRows.map((r) => [r.sid, r]));

      for (const twilioCall of openTwilioCalls) {
        const local = localBySid.get(twilioCall.sid);
        if (!local) {
          callsSkipped++;
          continue;
        }
        const twilioStatus = twilioCall.status?.toLowerCase();
        if (twilioStatus && local.status !== twilioStatus) {
          await tdb.call.update({
            set: {
              status: twilioStatus,
              duration: String(twilioCall.duration ?? local.duration ?? ""),
              end_time: twilioCall.endTime?.toISOString() ?? local.end_time,
              date_updated: twilioCall.dateUpdated?.toISOString() ?? local.date_updated,
            },
            where: eq(call.sid, twilioCall.sid),
          });
          callsUpdated++;
        }
      }
    }

    // ─── Messages ──────────────────────────────────────────
    const twilioMessages = await twilio.messages.list({
      limit: messageLimit,
      pageSize: messageLimit,
      dateSentAfter: since,
    });

    let messagesUpdated = 0;
    let messagesSkipped = 0;

    const openTwilioMessages = twilioMessages.filter((m) =>
      OPEN_MESSAGE_STATUSES.has(m.status?.toLowerCase() ?? ""),
    );

    if (openTwilioMessages.length > 0) {
      const sids = openTwilioMessages.map((m) => m.sid);
      const localRows = await tdb.message.findMany({
        where: inArray(message.sid, sids),
      });
      const localBySid = new Map(localRows.map((r) => [r.sid, r]));

      for (const twilioMsg of openTwilioMessages) {
        const local = localBySid.get(twilioMsg.sid);
        if (!local) {
          messagesSkipped++;
          continue;
        }
        const twilioStatus = twilioMsg.status?.toLowerCase();
        if (twilioStatus && local.status !== twilioStatus) {
          await tdb.message.update({
            set: {
              status: twilioStatus,
              date_updated: twilioMsg.dateUpdated?.toISOString() ?? local.date_updated,
              error_code: twilioMsg.errorCode ? Number(twilioMsg.errorCode) : local.error_code,
            },
            where: eq(message.sid, twilioMsg.sid),
          });
          messagesUpdated++;
        }
      }
    }

    const msg =
      `Open sync complete: ${callsUpdated} calls updated, ${callsSkipped} calls not found in DB; ` +
      `${messagesUpdated} messages updated, ${messagesSkipped} messages not found in DB.`;

    logger.info("Twilio open sync complete", {
      workspaceId,
      callsUpdated,
      callsSkipped,
      messagesUpdated,
      messagesSkipped,
    });

    return { ok: true, message: msg };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Twilio open sync failed", { workspaceId, error: errorMessage });
    return { ok: false, error: `Open sync failed: ${errorMessage}` };
  }
}

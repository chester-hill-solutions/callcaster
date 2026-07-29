import { and, gte, inArray } from "drizzle-orm";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { call, message } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { processCallStatusWebhook } from "@/lib/twilio-call-status.server";
import { updateMessageBySid } from "@/lib/message-db.server";
import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { SMS_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { isTerminalSmsStatus, normalizeSmsStatus } from "@/lib/sms-status";

const OPEN_CALL_STATUSES = [
  "queued",
  "ringing",
  "in-progress",
  "initiated",
] as const;

const OPEN_MESSAGE_STATUSES = [
  "accepted",
  "scheduled",
  "queued",
  "sending",
] as const;

/**
 * Reconcile stale LOCAL call/message statuses against Twilio REST for a
 * workspace.
 *
 * The sync is driven by local rows stuck in an open (non-terminal) status —
 * the population left behind when a Twilio status callback was lost. Each
 * such row is compared with Twilio's authoritative status and any change is
 * routed through the same canonical processors as the webhooks:
 *
 * - Calls: `processCallStatusWebhook` (guarded status write + terminal-call
 *   debit via the idempotent ledger insert).
 * - Messages: `updateMessageBySid` + the `sms_status_side_effects` job, whose
 *   handler owns the SMS debit (idempotent per message SID).
 *
 * A previous version filtered the Twilio result set to provider-OPEN
 * statuses, which discarded exactly the calls/messages that had gone terminal
 * without a webhook — leaving them unbilled forever (TEL-04).
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
    const sinceIso = since.toISOString();

    // ─── Calls ─────────────────────────────────────────────
    let callsUpdated = 0;
    let callsBilled = 0;
    let callsSkipped = 0;

    const localOpenCalls = await tdb.call.findMany({
      where: and(
        inArray(call.status, [...OPEN_CALL_STATUSES]),
        gte(call.date_created, sinceIso),
      ),
      limit: callLimit,
    });

    if (localOpenCalls.length > 0) {
      // One list request covers the common case; rows outside its window are
      // fetched individually (bounded by callLimit).
      const twilioCalls = await twilio.calls.list({
        limit: callLimit,
        pageSize: callLimit,
        startTime: since,
      });
      const twilioBySid = new Map(twilioCalls.map((c) => [c.sid, c]));

      for (const local of localOpenCalls) {
        let remote = twilioBySid.get(local.sid);
        if (!remote) {
          try {
            remote = await twilio.calls(local.sid).fetch();
          } catch {
            callsSkipped++;
            continue;
          }
        }

        const twilioStatus = remote.status?.toLowerCase();
        if (!twilioStatus || twilioStatus === local.status) continue;

        const { billingResult } = await processCallStatusWebhook(
          {
            sid: local.sid,
            // Required insert columns; the row exists, so these are echoes.
            date_created: local.date_created,
            is_last: local.is_last,
            status: twilioStatus,
            duration:
              remote.duration != null ? String(remote.duration) : undefined,
            end_time: remote.endTime?.toISOString() ?? undefined,
            date_updated: remote.dateUpdated?.toISOString() ?? undefined,
          },
          { workspaceId, note: `Call ${local.sid} (open-sync recovery)` },
        );
        callsUpdated++;
        if (billingResult?.inserted) callsBilled++;
      }
    }

    // ─── Messages ──────────────────────────────────────────
    let messagesUpdated = 0;
    let messagesSkipped = 0;

    const localOpenMessages = await tdb.message.findMany({
      where: and(
        inArray(message.status, [...OPEN_MESSAGE_STATUSES]),
        gte(message.date_created, sinceIso),
      ),
      limit: messageLimit,
    });

    if (localOpenMessages.length > 0) {
      const twilioMessages = await twilio.messages.list({
        limit: messageLimit,
        pageSize: messageLimit,
        dateSentAfter: since,
      });
      const twilioBySid = new Map(twilioMessages.map((m) => [m.sid, m]));

      for (const local of localOpenMessages) {
        let remote = twilioBySid.get(local.sid);
        if (!remote) {
          try {
            remote = await twilio.messages(local.sid).fetch();
          } catch {
            messagesSkipped++;
            continue;
          }
        }

        const twilioStatus = remote.status?.toLowerCase();
        if (!twilioStatus || twilioStatus === local.status) continue;

        const errorCode = remote.errorCode ? Number(remote.errorCode) : null;
        await updateMessageBySid(workspaceId, local.sid, {
          status: twilioStatus,
          date_updated:
            remote.dateUpdated?.toISOString() ?? local.date_updated,
          ...(errorCode != null ? { error_code: errorCode } : {}),
        });
        messagesUpdated++;

        // Terminal discovery must also run the billing/side-effects path the
        // lost webhook would have run. The job + ledger are both idempotent,
        // so racing a late-arriving webhook cannot double-debit.
        if (isTerminalSmsStatus(normalizeSmsStatus(twilioStatus))) {
          await enqueueJob({
            type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
            workspaceId,
            idempotencyKey: `sms_status_side_effects:${local.sid}:${twilioStatus}`,
            params: {
              messageSid: local.sid,
              twilioParams: {
                MessageStatus: twilioStatus,
                ...(errorCode != null ? { ErrorCode: String(errorCode) } : {}),
              },
            },
          });
        }
      }
    }

    const msg =
      `Open sync complete: ${callsUpdated} calls updated (${callsBilled} billed), ${callsSkipped} calls unresolvable at Twilio; ` +
      `${messagesUpdated} messages updated, ${messagesSkipped} messages unresolvable at Twilio.`;

    logger.info("Twilio open sync complete", {
      workspaceId,
      callsUpdated,
      callsBilled,
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

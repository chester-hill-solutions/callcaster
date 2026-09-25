import { and, asc, gt, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { call, message } from "@/db/schema";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { processCallStatusWebhook } from "@/lib/twilio-call-status.server";
import {
  isPendingMessageSid,
  resolveMessageByClientRef,
  updateMessageBySid,
} from "@/lib/message-db.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { SMS_STATUS_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";
import { isTerminalSmsStatus, normalizeSmsStatus } from "@/lib/sms-status";

/**
 * An intent row (#1582) normally gets its real SID within seconds, from the
 * post-send resolve or the first status callback. Past this age, neither
 * happened: match it to the provider by number pair, or fail it (no debit).
 */
const PENDING_INTENT_STALE_MS = 10 * 60_000;

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
 * Age window for the provider send-time backfill (#2049).
 *
 * LOWER bound — a row younger than this has only just left an open status, so
 * a `dateSent` may not be readable yet. Re-checking it next run costs one
 * cheap API call and, because the row stays selected, it costs nothing
 * persistent. The window exists only to avoid pointless calls, not for
 * correctness: `dateSent` is set at carrier handoff, which precedes the
 * terminal status we are keying off, so in practice it is already there.
 *
 * UPPER bound — the self-limiter. Without it, a row the provider can never
 * report a `dateSent` for (a message cancelled before handoff, or one that
 * failed as unreachable) would be re-selected on every sweep forever. The
 * failure mode of stopping too early is a NULL column, which is recoverable
 * and honest; the failure mode of never stopping is an unbounded bill of API
 * calls. So err toward stopping.
 *
 * This is deliberately an age bound, which the open-row sweep above must never
 * grow one: there, a row that cannot be resolved is still *live work* and
 * silently escaping the sweep strands a contact forever (#1289). Here, a row
 * with no recoverable send time is simply missing an audit field. Same
 * technique, opposite reason.
 */
const DATE_SENT_BACKFILL_MIN_AGE_MS = 30 * 60_000;
const DATE_SENT_BACKFILL_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Rows per run given to the send-time backfill.
 *
 * A large blast leaves a large one-time backlog: the Lombardi campaign had
 * 23,504 outbound rows, none of which recorded a send time. At the open-row
 * default of 50 per 5 minutes that backlog takes ~39 hours to drain. 100
 * halves it to ~20 hours while still costing at most 100 extra reads per run,
 * which is nothing against Twilio's read rate limit. Steady state is one
 * indexed query that returns zero rows.
 */
const DATE_SENT_BACKFILL_LIMIT = 100;

type ProviderMessage = {
  sid: string;
  to?: string | null;
  from?: string | null;
  status?: string | null;
  errorCode?: string | number | null;
  dateCreated?: Date | null;
  dateSent?: Date | null;
  dateUpdated?: Date | null;
};

function providerTime(m: ProviderMessage): number {
  return (m.dateCreated ?? m.dateSent ?? new Date(0)).getTime();
}

/**
 * A placeholder row (#1582) has no SID to fetch. Young ones are still in
 * flight. Stale ones are matched to the earliest provider message for the
 * same number pair sent after the intent (a Twilio number belongs to one
 * workspace); when the provider has nothing, the intent is failed with no
 * debit.
 */
async function reconcilePendingIntent<T extends ProviderMessage>(args: {
  workspaceId: string;
  local: { sid: string; to: string | null; from: string | null; client_ref: string | null; date_created: string | null };
  twilioMessages: T[];
}): Promise<
  | { kind: "skipped" }
  | { kind: "failed" }
  | { kind: "resolved"; remote: T }
> {
  const { workspaceId, local, twilioMessages } = args;
  const createdAt = local.date_created ? new Date(local.date_created).getTime() : 0;
  if (Date.now() - createdAt < PENDING_INTENT_STALE_MS) {
    return { kind: "skipped" };
  }
  const match = twilioMessages
    .filter(
      (m) =>
        m.to === local.to &&
        (local.from == null || m.from === local.from) &&
        providerTime(m) >= createdAt,
    )
    .sort((a, b) => providerTime(a) - providerTime(b))[0];
  if (!match || !local.client_ref) {
    await updateMessageBySid(workspaceId, local.sid, {
      status: "failed",
      error_message: "No provider record for this send (open-sync)",
      date_updated: new Date().toISOString(),
    });
    logger.warn("Twilio open sync: pending intent failed, nothing at provider", {
      workspaceId,
      clientRef: local.client_ref,
      to: local.to,
    });
    return { kind: "failed" };
  }
  await resolveMessageByClientRef(workspaceId, local.client_ref, { sid: match.sid });
  logger.warn("Twilio open sync: pending intent resolved by number pair", {
    workspaceId,
    clientRef: local.client_ref,
    sid: match.sid,
  });
  return { kind: "resolved", remote: match };
}

/**
 * Reconcile stale LOCAL call/message statuses against Twilio REST for a
 * workspace.
 *
 * `maxAgeMinutes` bounds the bulk list() prefetch window and sets the grace
 * age before a Twilio-404 call row is terminalized — it does NOT bound which
 * rows are swept. Selection is every locally-open row, oldest first (#1289).
 *
 * Messages have a second, separate population (#2049): rows that have left
 * the open statuses but never recorded the provider's send time. They get
 * their own query and their own limit so a send-time backlog can never starve
 * lost-callback recovery, but they are reconciled in the same loop.
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
  dateSentBackfillLimit = DATE_SENT_BACKFILL_LIMIT,
}: {
  workspaceId: string;
  callLimit?: number;
  messageLimit?: number;
  maxAgeMinutes?: number;
  dateSentBackfillLimit?: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const twilio = await createWorkspaceTwilioInstance({
      workspace_id: workspaceId,
    });

    const tdb = createTenantDb(workspaceId);
    const since = new Date(Date.now() - maxAgeMinutes * 60_000);

    // ─── Calls ─────────────────────────────────────────────
    let callsUpdated = 0;
    let callsBilled = 0;
    let callsSkipped = 0;

    // Sweep EVERY open row, oldest first — not just rows created inside the
    // prefetch window. The previous `date_created >= since` selection meant a
    // row that stayed open longer than maxAgeMinutes graduated permanently
    // out of the sweep: the dev environment accumulated 19 calls stuck in
    // 'queued' for weeks (#1289), each blocking its contact from being
    // re-dialed while inside claim_queue_entry_for_dial's active_call window.
    // Once a row is repaired it leaves this population, so the backlog drains
    // at callLimit rows per run.
    const localOpenCalls = await tdb.call.findMany({
      where: inArray(call.status, [...OPEN_CALL_STATUSES]),
      orderBy: [asc(call.date_created)],
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
          } catch (error) {
            // Twilio definitively not knowing the SID (REST 404 / 20404) is
            // an answer, not an outage: the call never existed there or was
            // purged. Left as a skip, such a row stays open forever and gets
            // re-fetched every run (#1289). Terminalize it as 'failed' once
            // it is old enough that a race with call creation is impossible;
            // the canonical processor writes the guarded status, and billing
            // never debits a terminal call without a duration. Transient
            // failures (auth, 5xx, network) still skip and retry next run.
            const status = (error as { status?: number; code?: number }) ?? {};
            const isNotFound = status.status === 404 || status.code === 20404;
            const rowAgeMs = Date.now() - new Date(local.date_created).getTime();
            if (isNotFound && rowAgeMs > maxAgeMinutes * 60_000) {
              await processCallStatusWebhook(
                {
                  sid: local.sid,
                  date_created: local.date_created,
                  is_last: local.is_last,
                  status: "failed",
                },
                {
                  workspaceId,
                  note: `Call ${local.sid} (open-sync 404 terminalization)`,
                },
              );
              callsUpdated++;
              continue;
            }
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
    let intentsResolved = 0;
    let intentsFailed = 0;

    // Same open-population sweep as calls (#1289): the old windowed selection
    // let a message stuck longer than maxAgeMinutes escape the sweep forever.
    // A Twilio 404 still skips (never terminalizes) here: the SMS side-effects
    // job debits terminal messages per SID, and fabricating a terminal status
    // for a message Twilio never had risks billing a send that never happened.
    const localOpenMessages = await tdb.message.findMany({
      where: inArray(message.status, [...OPEN_MESSAGE_STATUSES]),
      orderBy: [asc(message.date_created)],
      limit: messageLimit,
    });

    // Send-time backfill (#2049). A separate population on a separate budget,
    // deliberately NOT merged into the open-row query: merging them would let
    // a large send-time backlog starve lost-callback recovery, which is the
    // one job this sweep must never drop. Two queries, two limits, one loop.
    //
    // "Not open" rather than "settled" on purpose. The provider sets dateSent
    // at carrier handoff, which is before any terminal status, so a `sent` row
    // has a real send time worth recording; excluding it would leave the rows
    // most worth auditing (the ones still awaiting delivery) blank.
    const localUntimedMessages = await tdb.message.findMany({
      where: and(
        isNull(message.date_sent),
        notInArray(message.status, [...OPEN_MESSAGE_STATUSES]),
        // ISO strings, not Dates: the schema models every timestamp column on
        // this table as text, so Drizzle's typed comparators reject a Date.
        gt(message.date_created, new Date(Date.now() - DATE_SENT_BACKFILL_MAX_AGE_MS).toISOString()),
        lt(message.date_created, new Date(Date.now() - DATE_SENT_BACKFILL_MIN_AGE_MS).toISOString()),
      ),
      orderBy: [asc(message.date_created)],
      limit: dateSentBackfillLimit,
    });

    const localMessages = [...localOpenMessages, ...localUntimedMessages];
    // The status sets are disjoint, so the populations cannot overlap.
    if (localMessages.length > 0) {
      // Only the open population benefits: backfill rows are by definition
      // outside the prefetch window, so the list call would miss them all and
      // every one of them costs an individual fetch.
      const twilioMessages =
        localOpenMessages.length > 0
          ? await twilio.messages.list({
              limit: messageLimit,
              pageSize: messageLimit,
              dateSentAfter: since,
            })
          : [];
      const twilioBySid = new Map(twilioMessages.map((m) => [m.sid, m]));

      for (const localRow of localMessages) {
        let local = localRow;
        let remote = twilioBySid.get(local.sid);

        // Flat on purpose: an extra nesting level here trips the depth ratchet.
        const intentOutcome = isPendingMessageSid(local.sid)
          ? await reconcilePendingIntent({ workspaceId, local, twilioMessages })
          : null;
        if (intentOutcome && intentOutcome.kind !== "resolved") {
          messagesSkipped += intentOutcome.kind === "skipped" ? 1 : 0;
          intentsFailed += intentOutcome.kind === "failed" ? 1 : 0;
          continue;
        }
        if (intentOutcome) {
          intentsResolved++;
          local = { ...local, sid: intentOutcome.remote.sid };
          remote = intentOutcome.remote;
        }

        if (!remote) {
          try {
            remote = await twilio.messages(local.sid).fetch();
          } catch {
            messagesSkipped++;
            continue;
          }
        }

        const twilioStatus = remote.status?.toLowerCase();
        if (!twilioStatus) continue;

        // "Nothing to do" is now narrower than "status matches" (#2049). A
        // settled row with no send time still has work: its status matches the
        // provider exactly, and it is precisely that kind of row this loop
        // could never have written a date_sent for, because the old
        // early-exit fired first.
        const statusUnchanged = twilioStatus === local.status;
        const remoteDateSent = remote.dateSent?.toISOString();
        if (statusUnchanged && (local.date_sent != null || !remoteDateSent)) {
          continue;
        }

        const errorCode = remote.errorCode ? Number(remote.errorCode) : null;

        // Terminal discovery must also run the billing/side-effects path the
        // lost webhook would have run. Queue it BEFORE the status write: this
        // sweep only revisits open rows, so a terminal status with no queued
        // job would never be billed. The job + ledger are both idempotent, so
        // a retry of this row (status write failed) or a late-arriving webhook
        // cannot double-debit.
        //
        // Only on a status CHANGE. A backfill row already matches the provider,
        // so re-running its side effects would be safe but pure waste — and a
        // 23,504-row backfill would enqueue 23,504 billing jobs to rediscover
        // that every message had already been debited.
        if (
          !statusUnchanged &&
          isTerminalSmsStatus(normalizeSmsStatus(twilioStatus))
        ) {
          await enqueueRegisteredJob({
            type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
            workspaceId,
            idempotencyKey: `sms_status_side_effects:${local.sid}:${twilioStatus}`,
            params: {
              sid: local.sid,
              twilioParams: {
                MessageStatus: twilioStatus,
                ...(errorCode != null ? { ErrorCode: String(errorCode) } : {}),
              },
            },
          });
        }

        await updateMessageBySid(workspaceId, local.sid, {
          // Omit `status` when it is unchanged so this is a pure send-time
          // write: updateMessageBySid only reports a status regression, and a
          // same-value write would otherwise be indistinguishable from a real
          // transition in the logs.
          ...(statusUnchanged ? {} : { status: twilioStatus }),
          date_updated:
            remote.dateUpdated?.toISOString() ?? local.date_updated,
          ...(remoteDateSent ? { date_sent: remoteDateSent } : {}),
          ...(errorCode != null ? { error_code: errorCode } : {}),
        });
        messagesUpdated++;
      }
    }

    const msg =
      `Open sync complete: ${callsUpdated} calls updated (${callsBilled} billed), ${callsSkipped} calls unresolvable at Twilio; ` +
      `${messagesUpdated} messages updated, ${messagesSkipped} messages unresolvable at Twilio, ` +
      `${intentsResolved} pending intents resolved, ${intentsFailed} pending intents failed.`;

    logger.info("Twilio open sync complete", {
      workspaceId,
      callsUpdated,
      callsBilled,
      callsSkipped,
      messagesUpdated,
      messagesSkipped,
      intentsResolved,
      intentsFailed,
    });

    return { ok: true, message: msg };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Twilio open sync failed", { workspaceId, error: errorMessage });
    return { ok: false, error: `Open sync failed: ${errorMessage}` };
  }
}

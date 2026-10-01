import { and, desc, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { call as callTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { logger } from "@/lib/logger.server";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { RECORDING_SIDE_EFFECTS_JOB_TYPE } from "@/lib/worker/job-types.server";

/**
 * Repair sweep for call recordings whose copy out of Twilio never landed.
 *
 * #2166: `persistCallRecordingToStorage` used to return a failure the caller
 * logged and swallowed, so the job reported success, the idempotency key was
 * consumed, and `call.audio_url` stayed NULL with no way back. The copy now
 * throws, which makes the loss *visible* — a failed job retries and eventually
 * dead-letters. Loud is not the same as recovered: Twilio's retention window
 * still runs, and once it does the audio is gone for good.
 *
 * This is the half that recovers it. It finds calls that demonstrably have a
 * recording (`recording_sid` set, written BEFORE the copy is attempted) and no
 * stored copy (`audio_url` NULL), and re-drives `recording_side_effects` for
 * them. #2169 is what made the find query possible — without the pre-copy
 * write there is no row to search on, so a failure would be unrepresentable in
 * the database.
 */

/** Bounded per run so one sweep cannot enqueue an unbounded burst. */
export const DEFAULT_REPAIR_LIMIT = 100;

/**
 * How old a call's recording must be before the sweep touches it. The copy
 * throws fast, but a worker retry could still land minutes later; racing it
 * would enqueue a duplicate copy of the same recording.
 */
export const REPAIR_MIN_AGE_MINUTES = 30;

/** Backdate beyond this and Twilio cannot still hold the media. */
export const REPAIR_MAX_AGE_DAYS = 60;

/**
 * The idempotency-key salt granularity. Equal to the sweep's cadence, so
 * "at most one repair attempt per call per day" is a property of the key
 * rather than of when the worker happened to run.
 */
const DAY_BUCKET_MS = 24 * 60 * 60 * 1000;

export type RepairSweepResult = {
  scanned: number;
  /** Calls re-driven for a fresh copy attempt. */
  requeued: number;
  /**
   * Skipped because the row carries no account SID or no recording SID, so
   * there is no way to address the recording at Twilio. Age is excluded in SQL
   * and never reaches this counter.
   */
  skippedUnservable: number;
  /** Enqueue failures. Counted, never thrown — one bad row must not stop the sweep. */
  enqueueFailed: number;
};

/**
 * A distinct idempotency key from the original delivery's. The original was
 * `recording_side_effects:<callSid>:<recordingUrl>` and that row is consumed,
 * so reusing it would dedupe the repair away — the sweep would enqueue nothing
 * and report success.
 *
 * The suffix is the DAY BUCKET, not the sweep's own clock. That distinction is
 * the whole point: keying on the exact run time gives every run a unique key,
 * so a second sweep the same day re-enqueues every candidate instead of
 * deduping. Keyed on the day, any number of sweeps within one day collapse to
 * the same key and the queue dedupes them, while tomorrow's sweep still gets a
 * fresh key and retries the recordings that are still unrepaired.
 *
 * Not exported: the invariant that matters is the key actually handed to the
 * queue, which is asserted on the enqueued payload, not on this function.
 */
function repairIdempotencyKey(callSid: string, runStartedAtMs: number): string {
  const dayBucket = Math.floor(runStartedAtMs / DAY_BUCKET_MS);
  return `recording_repair:${callSid}:${dayBucket}`;
}

/**
 * The minimal Twilio callback that makes the voice parser classify this as a
 * `recording` event. The parser discriminates on the presence of
 * `RecordingSid`, and `runRecordingSideEffects` reads only `recordingSid`,
 * `recordingDuration`, and `accountSid` off the parsed event.
 */
export function repairTwilioParams(row: {
  sid: string;
  accountSid: string | null;
  recordingSid: string | null;
  recordingDuration: string | null;
}): Record<string, string> {
  return {
    CallSid: row.sid,
    AccountSid: row.accountSid ?? "",
    RecordingSid: row.recordingSid ?? "",
    RecordingStatus: "completed",
    ...(row.recordingDuration ? { RecordingDuration: row.recordingDuration } : {}),
  };
}

export async function runRecordingRepairSweep(args?: {
  limit?: number;
  now?: Date;
}): Promise<RepairSweepResult> {
  const limit = args?.limit ?? DEFAULT_REPAIR_LIMIT;
  const now = args?.now ?? new Date();
  const earliest = new Date(now.getTime() - REPAIR_MIN_AGE_MINUTES * 60_000);
  const oldest = new Date(now.getTime() - REPAIR_MAX_AGE_DAYS * 86_400_000);

  // These used to be raw `sql` with a `::timestamptz` cast, because
  // `call.date_created` was declared `text()` and the typed comparators would
  // not accept it. The column really is `timestamptz`, so the cast was
  // restating a lie the schema told; it is now the typed comparators, and
  // `scripts/baselines/schema-type-drift.txt` fails if the column drifts back.

  const candidates = await adminDb
    .select({
      sid: callTable.sid,
      workspace: callTable.workspace,
      accountSid: callTable.account_sid,
      recordingSid: callTable.recording_sid,
      recordingDuration: callTable.recording_duration,
    })
    .from(callTable)
    .where(
      and(
        isNotNull(callTable.recording_sid),
        isNull(callTable.audio_url),
        lt(callTable.date_created, earliest),
        gt(callTable.date_created, oldest),
      ),
    )
    // NEWEST first, deliberately. This set is not homogeneous: a call whose
    // recording has already aged out of Twilio's retention can never be
    // repaired, and such rows never leave the candidate set — they just stop
    // being copyable. Ordering oldest-first with a hard limit therefore parks
    // the permanently-broken rows at the head of the queue and starves every
    // newer, genuinely repairable call behind them, indefinitely.
    //
    // Newest-first inverts that: recent recordings are both the most likely to
    // still be in Twilio's window AND the most likely to succeed, so a stuck
    // old row is starved harmlessly. It ages out past `REPAIR_MAX_AGE_DAYS`
    // on its own instead of blocking the queue.
    .orderBy(desc(callTable.date_created))
    .limit(limit);

  let requeued = 0;
  let skippedUnservable = 0;
  let enqueueFailed = 0;

  for (const row of candidates) {
    // Without an account SID there is no way to address the recording at Twilio.
    // Retrying cannot help, so the row is dropped rather than re-enqueued.
    if (!row.recordingSid || !row.accountSid) {
      skippedUnservable++;
      continue;
    }

    const twilioParams = repairTwilioParams({
      sid: row.sid,
      accountSid: row.accountSid,
      recordingSid: row.recordingSid,
      recordingDuration: row.recordingDuration,
    });

    try {
      await enqueueRegisteredJob({
        type: RECORDING_SIDE_EFFECTS_JOB_TYPE,
        workspaceId: row.workspace ? String(row.workspace) : null,
        params: {
          sid: row.sid,
          twilioParams,
          event: parseTwilioVoiceCallback(twilioParams),
        },
        dedupe: {
          kind: "idempotency",
          key: repairIdempotencyKey(row.sid, now.getTime()),
        },
      });
      requeued++;
    } catch (error) {
      enqueueFailed++;
      logger.error("recording_repair.enqueue_failed", {
        callSid: row.sid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary: RepairSweepResult = {
    scanned: candidates.length,
    requeued,
    skippedUnservable,
    enqueueFailed,
  };
  logger.info("recording_repair.sweep", {
    ...summary,
    // The age window is a narrowing of the requested find-set, and `scanned`
    // alone cannot show that. An operator seeing `scanned: 0` needs to
    // distinguish "nothing to repair" from "everything fell outside the
    // window", and the two look identical without these bounds.
    windowStart: oldest.toISOString(),
    windowEnd: earliest.toISOString(),
    maxRows: limit,
  });
  return summary;
}

import { and, asc, isNotNull, isNull, sql } from "drizzle-orm";
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

export type RepairSweepResult = {
  ok: true;
  scanned: number;
  /** Calls re-driven for a fresh copy attempt. */
  requeued: number;
  /**
   * Skipped because a credential probe said the workspace cannot authenticate.
   * Expect this to be 0 in production: see `hasCredentials` — no probe is wired
   * yet, so the sweep assumes every workspace is usable and lets a doomed job
   * fail loudly instead.
   */
  skippedNoCredentials: number;
  /** Skipped because there is no account SID or the recording is too old. */
  skippedUnservable: number;
  /** Enqueue failures. Counted, never thrown — one bad row must not stop the sweep. */
  enqueueFailed: number;
};

/**
 * A distinct idempotency key from the original delivery's. The original was
 * `recording_side_effects:<callSid>:<recordingUrl>` and that row is consumed,
 * so reusing it would dedupe the repair away — the sweep would enqueue nothing
 * and report success.
 */
export function repairIdempotencyKey(callSid: string, attempt: number): string {
  return `recording_repair:${callSid}:${attempt}`;
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
  /**
   * Per-workspace credential probe, injected in tests. Defaults to "assume
   * usable", so production always requeues.
   *
   * That default is deliberate, and it is a known gap rather than an oversight:
   * a probe cannot detect #2170. Stale subaccount credentials are structurally
   * identical to working ones — the row exists, the token string is populated,
   * only a live Twilio call reveals the rejection. So a presence check would
   * report dev's 18 dead workspaces as healthy and skip nothing, which is worse
   * than an honest "assume usable": it would look like the guard works.
   *
   * Until #2170 lands a real probe, a doomed repair job fails loudly, retries,
   * and dead-letters — recoverable and visible. The wiring point is here so the
   * probe can drop in without reshaping the sweep.
   */
  hasCredentials?: (workspaceId: string) => Promise<boolean>;
}): Promise<RepairSweepResult> {
  const limit = args?.limit ?? DEFAULT_REPAIR_LIMIT;
  const now = args?.now ?? new Date();
  const earliest = new Date(
    now.getTime() - REPAIR_MIN_AGE_MINUTES * 60_000,
  ).toISOString();
  const oldest = new Date(
    now.getTime() - REPAIR_MAX_AGE_DAYS * 86_400_000,
  ).toISOString();

  // `date_created` is `text()` in the Drizzle schema but `timestamptz` in the
  // database, so the age bounds need an explicit cast. A lexicographic string
  // comparison is not merely wrong here, it is not even accepted.
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
        sql`${callTable.date_created}::timestamptz < ${earliest}::timestamptz`,
        sql`${callTable.date_created}::timestamptz > ${oldest}::timestamptz`,
      ),
    )
    .orderBy(asc(sql`${callTable.date_created}::timestamptz`))
    .limit(limit);

  const hasCredentials = args?.hasCredentials ?? (async () => true);

  let requeued = 0;
  let skippedNoCredentials = 0;
  let skippedUnservable = 0;
  let enqueueFailed = 0;

  for (const row of candidates) {
    // Without an account SID there is no way to address the recording at Twilio.
    if (!row.recordingSid || !row.accountSid) {
      skippedUnservable++;
      continue;
    }

    const usable = await hasCredentials(String(row.workspace));
    if (!usable) {
      // Retrying cannot help, so do not churn a job that fails identically
      // every single run. Unreachable until a real probe is wired — see the
      // `hasCredentials` doc for why a presence check would not help.
      skippedNoCredentials++;
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
    ok: true,
    scanned: candidates.length,
    requeued,
    skippedNoCredentials,
    skippedUnservable,
    enqueueFailed,
  };
  logger.info("recording_repair.sweep", summary);
  return summary;
}

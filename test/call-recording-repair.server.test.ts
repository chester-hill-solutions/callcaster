import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  whereClause: null as unknown,
  enqueueRegisteredJob: vi.fn(async () => ({ enqueued: true })),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/admin-db", () => ({ adminDb: { select: mocks.select } }));
// Spread the real module so future logger exports keep flowing. A literal
// factory freezes the export surface, and the next person who adds an export
// gets a catch-all failure in an unrelated test.
vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: mocks.logger,
}));
vi.mock("@/lib/worker/job-params.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/job-params.server")>()),
  enqueueRegisteredJob: (...args: unknown[]) => mocks.enqueueRegisteredJob(...args),
}));

import {
  repairIdempotencyKey,
  repairTwilioParams,
  runRecordingRepairSweep,
} from "@/lib/call-recording-repair.server";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";
import { recordingSideEffectsParams } from "@/lib/worker/job-params.server";


/** A call row the find query would return: we know the recording, we have no copy. */
function candidate(overrides: Record<string, unknown> = {}) {
  return {
    sid: "CA1",
    workspace: "w1",
    accountSid: "ACsub",
    recordingSid: "RE1",
    recordingDuration: "12",
    ...overrides,
  };
}

function stubCandidates(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: (clause: unknown) => {
      mocks.whereClause = clause;
      return chain;
    },
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  mocks.select.mockReturnValue(chain);
}

/**
 * The find query is the whole feature, and `adminDb` is mocked — so the stub
 * returns whatever rows it is handed no matter what the WHERE clause says. The
 * filter has to be asserted directly or the sweep is untested where it matters.
 * Renders the Drizzle clause to SQL so the assertions are on the query, not on
 * the builder's internal shape.
 */
/**
 * `and(...)` nests its clauses, so walk the whole tree rather than the top
 * level. Returns column names and embedded SQL text separately: a Column
 * carries `name`, a Param carries `queryChunks`.
 */
function flatten(node: unknown): { columns: string[]; sql: string } {
  const columns: string[] = [];
  const words: string[] = [];
  const seen = new Set<unknown>();

  const walk = (n: unknown): void => {
    if (n === null || n === undefined || seen.has(n)) return;
    if (typeof n === "string") { words.push(n); return; }
    if (typeof n !== "object") return;
    seen.add(n);
    const obj = n as Record<string, unknown>;
    if (typeof obj.name === "string") columns.push(obj.name);
    for (const key of ["queryChunks", "left", "right", "expression", "value"]) {
      const child = obj[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child !== undefined && typeof child === "object") walk(child);
      else if (typeof child === "string") words.push(child);
    }
  };
  walk(node);
  return { columns, sql: words.join(" ") };
}

const NOW = new Date("2026-09-28T12:00:00.000Z");

describe("runRecordingRepairSweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueRegisteredJob.mockResolvedValue({ enqueued: true });
  });

  /**
   * The whole point of the sweep. Without it a failed copy is dead-lettered —
   * loud, but still lost audio once Twilio's window closes.
   */
  test("re-drives a call that has a recording but no stored copy", async () => {
    stubCandidates([candidate()]);

    const result = await runRecordingRepairSweep({ now: NOW });

    expect(result).toEqual({
      ok: true,
      scanned: 1,
      requeued: 1,
      skippedNoCredentials: 0,
      skippedUnservable: 0,
      enqueueFailed: 0,
    });
    expect(mocks.enqueueRegisteredJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recording_side_effects",
        workspaceId: "w1",
        params: expect.objectContaining({ sid: "CA1" }),
      }),
    );
  });

  /**
   * Kill-check for the test above. The enqueued payload must parse back as a
   * `recording` event — `runRecordingSideEffects` reads recordingSid and
   * accountSid off it and does nothing without them, so a payload that parses
   * as any other kind would re-run the job and copy nothing, forever.
   */
  test("the re-driven payload parses as a recording event with the real SIDs", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });

    const { params } = mocks.enqueueRegisteredJob.mock.calls[0][0];
    const event = parseTwilioVoiceCallback(params.twilioParams);
    expect(event.kind).toBe("recording");
    expect(event).toMatchObject({
      callSid: "CA1",
      accountSid: "ACsub",
      recordingSid: "RE1",
      recordingDuration: "12",
    });
  });

  /**
   * The contract that actually matters, and the one the other tests miss.
   *
   * `parseTwilioVoiceCallback` succeeding proves only that the payload is
   * well-formed. The job is consumed through `recordingSideEffectsParams`,
   * which validates again at dequeue and rejects hard. A payload that parses
   * but fails the schema means the sweep reports success while enqueueing jobs
   * that can never run — 100 of them a day, silently.
   *
   * This is the test that fails first if the schema changes shape.
   */
  test("the enqueued payload is accepted by the real job-params schema", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });

    const { params } = mocks.enqueueRegisteredJob.mock.calls[0][0] as unknown as {
      params: unknown;
    };
    const result = recordingSideEffectsParams.safeParse(params);
    expect(result.success).toBe(true);
  });

  /**
   * Kill-check. The original delivery's key is `recording_side_effects:<sid>…`
   * and that row is consumed, so reusing that PREFIX would dedupe every repair
   * away — the sweep would report success while enqueueing nothing.
   *
   * Asserting the prefix rather than comparing to one hand-written key: a
   * `not.toBe(<literal>)` check passes for any key that merely differs from
   * that literal, including a wrongly-prefixed one. That check looked right and
   * survived a mutation that broke the behaviour it claimed to guard.
   */
  test("the repair key does not reuse the original delivery's prefix", () => {
    const key = repairIdempotencyKey("CA1", NOW.getTime());
    expect(key.startsWith("recording_side_effects:")).toBe(false);
    expect(key.startsWith("recording_repair:")).toBe(true);
    expect(key).toContain("CA1");
    // Same attempt, same key — the sweep is safe to run twice in one window.
    expect(repairIdempotencyKey("CA1", NOW.getTime())).toBe(key);
    // Different attempts differ, so a later sweep is not blocked by an earlier.
    expect(repairIdempotencyKey("CA1", NOW.getTime() + 1)).not.toBe(key);
  });

  test("is idempotent within a window: a second run enqueues the same keys", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });
    await runRecordingRepairSweep({ now: NOW });

    const [a, b] = mocks.enqueueRegisteredJob.mock.calls.map(
      (call) => (call[0] as { dedupe: { key: string } }).dedupe.key,
    );
    expect(a).toBe(b);
  });

  /** No account SID means there is no way to address the recording at Twilio. */
  test("skips a call with no account SID rather than enqueueing a doomed job", async () => {
    stubCandidates([candidate({ accountSid: null })]);

    const result = await runRecordingRepairSweep({ now: NOW });

    expect(result).toMatchObject({ scanned: 1, requeued: 0, skippedUnservable: 1 });
    expect(mocks.enqueueRegisteredJob).not.toHaveBeenCalled();
  });

  /**
   * #2170: every subaccount credential in dev is stale, so re-enqueueing there
   * would churn a job that fails identically every run.
   */
  test("skips a workspace with unusable credentials instead of churning it", async () => {
    stubCandidates([candidate()]);

    const result = await runRecordingRepairSweep({
      now: NOW,
      hasCredentials: async () => false,
    });

    expect(result).toMatchObject({ requeued: 0, skippedNoCredentials: 1 });
    expect(mocks.enqueueRegisteredJob).not.toHaveBeenCalled();
  });

  /** One bad row must not stop the sweep for the rest. */
  test("counts an enqueue failure and carries on", async () => {
    stubCandidates([candidate(), candidate({ sid: "CA2" })]);
    mocks.enqueueRegisteredJob
      .mockRejectedValueOnce(new Error("queue full"))
      .mockResolvedValueOnce({ enqueued: true });

    const result = await runRecordingRepairSweep({ now: NOW });

    expect(result).toMatchObject({ scanned: 2, requeued: 1, enqueueFailed: 1 });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "recording_repair.enqueue_failed",
      expect.objectContaining({ callSid: "CA1" }),
    );
  });

  /**
   * The find query, asserted as SQL. Drop `audio_url IS NULL` and the sweep
   * re-copies every recording it can find; drop `recording_sid IS NOT NULL`
   * and it enqueues jobs for calls that were never recorded.
   */
  test("finds only calls with a recording and no stored copy", async () => {
    stubCandidates([]);
    await runRecordingRepairSweep({ now: NOW });

    expect(flatten(mocks.whereClause).columns).toEqual(
      expect.arrayContaining(["recording_sid", "audio_url"]),
    );
  });

  /**
   * The age bounds. The lower one keeps the sweep from racing a copy that is
   * still in flight; the upper one stops it enqueueing rows whose media Twilio
   * can no longer serve. Both are `::timestamptz` casts because the column is
   * `text()` in the schema and `timestamptz` in the database.
   */
  test("bounds the sweep by age, as timestamptz", async () => {
    stubCandidates([]);
    await runRecordingRepairSweep({ now: NOW });

    const { columns, sql } = flatten(mocks.whereClause);
    expect(columns).toContain("date_created");
    expect(sql).toContain("::timestamptz <");
    expect(sql).toContain("::timestamptz >");
  });

  test("a sweep with nothing to repair is a no-op", async () => {
    stubCandidates([]);

    const result = await runRecordingRepairSweep({ now: NOW });

    expect(result).toMatchObject({ scanned: 0, requeued: 0 });
    expect(mocks.enqueueRegisteredJob).not.toHaveBeenCalled();
  });
});

describe("repairTwilioParams", () => {
  test("carries only what the recording side effects read", () => {
    expect(
      repairTwilioParams({
        sid: "CA1",
        accountSid: "ACsub",
        recordingSid: "RE1",
        recordingDuration: "30",
      }),
    ).toEqual({
      CallSid: "CA1",
      AccountSid: "ACsub",
      RecordingSid: "RE1",
      RecordingStatus: "completed",
      RecordingDuration: "30",
    });
  });

  test("omits duration when unknown rather than sending an empty string", () => {
    const params = repairTwilioParams({
      sid: "CA1",
      accountSid: "ACsub",
      recordingSid: "RE1",
      recordingDuration: null,
    });
    expect(params).not.toHaveProperty("RecordingDuration");
  });
});

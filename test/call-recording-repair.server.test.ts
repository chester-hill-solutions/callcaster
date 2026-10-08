import { beforeEach, describe, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  whereClause: null as unknown,
  orderSql: null as string | null,
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
  REPAIR_MAX_AGE_DAYS,
  REPAIR_MIN_AGE_MINUTES,
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
    orderBy: (clause: unknown) => {
      mocks.orderSql = pgDialect.sqlToQuery(clause as SQL).sql;
      return chain;
    },
    limit: () => Promise.resolve(rows),
  };
  mocks.select.mockReturnValue(chain);
}

/**
 * Render a Drizzle clause to real SQL.
 *
 * The find query is the whole feature, and `adminDb` is mocked — so the stub
 * returns whatever rows it is handed no matter what the WHERE clause says. The
 * filter has to be asserted directly or the sweep is untested where it matters,
 * and the only way to assert a query's shape against a mocked client is on the
 * rendered string.
 *
 * The previous approach walked Drizzle's private `queryChunks` / `left` /
 * `right` internals and matched substrings, which was both brittle — it broke
 * on a refactor that changed no behaviour — and wrong: a bare
 * `::timestamptz` substring check is satisfied by the literal-side casts, so
 * deleting the COLUMN cast entirely still passed. That is what #2174
 * supersedes with a real-Postgres tier; this is correct in the meantime and
 * does not depend on Drizzle's internal representation.
 */
const pgDialect = new PgDialect({ casing: { escapeName: (n: string) => `"${n}"` } });
const whereSql = (clause: unknown): string => pgDialect.sqlToQuery(clause as SQL).sql;

/** The values Drizzle binds into the WHERE clause, in order. */
const whereParams = (clause: unknown): unknown[] =>
  pgDialect.sqlToQuery(clause as SQL).params;

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
      scanned: 1,
      requeued: 1,
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
   * Asserted on the key actually handed to the queue, not on the helper that
   * builds it. Asserting the helper let a mutant that bypassed it at the call
   * site stay green; that check was not possible before. It also asserts the
   * PREFIX rather than comparing to one hand-written key, because a
   * `not.toBe(<literal>)` check passes for any key that merely differs from
   * that literal — including a wrongly-prefixed one.
   */
  test("the enqueued key does not reuse the original delivery's prefix", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });

    const { dedupe } = mocks.enqueueRegisteredJob.mock.calls[0][0] as unknown as {
      dedupe: { kind: string; key: string };
    };
    expect(dedupe.kind).toBe("idempotency");
    expect(dedupe.key.startsWith("recording_side_effects:")).toBe(false);
  });

  /**
   * At most one repair attempt per call per day, whatever the cadence.
   *
   * This is the test that fails when the key is salted with the sweep's own
   * clock instead of a day bucket: two runs 90 minutes apart would then mint two
   * different keys, the queue would dedupe nothing, and every unrepairable call
   * would be re-enqueued on every sweep — forever, since a call whose recording
   * has aged out of Twilio never leaves the candidate set.
   */
  test("two sweeps on the same day enqueue the same key, so the queue dedupes them", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });
    await runRecordingRepairSweep({ now: new Date(NOW.getTime() + 90 * 60_000) });

    const [a, b] = mocks.enqueueRegisteredJob.mock.calls.map(
      (call) => (call[0] as { dedupe: { key: string } }).dedupe.key,
    );
    expect(a).toBe(b);
  });

  /**
   * The other half of the same invariant: tomorrow must NOT be deduped against
   * today, or a recording that fails once would never be retried.
   */
  test("a sweep the next day enqueues a different key, so the call is retried", async () => {
    stubCandidates([candidate()]);
    await runRecordingRepairSweep({ now: NOW });
    await runRecordingRepairSweep({ now: new Date(NOW.getTime() + 25 * 60 * 60_000) });

    const [a, b] = mocks.enqueueRegisteredJob.mock.calls.map(
      (call) => (call[0] as { dedupe: { key: string } }).dedupe.key,
    );
    expect(b).not.toBe(a);
  });

  /** No account SID means there is no way to address the recording at Twilio. */
  test("skips a call with no account SID rather than enqueueing a doomed job", async () => {
    stubCandidates([candidate({ accountSid: null })]);

    const result = await runRecordingRepairSweep({ now: NOW });

    expect(result).toMatchObject({ scanned: 1, requeued: 0, skippedUnservable: 1 });
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

    const sql = whereSql(mocks.whereClause);
    expect(sql).toMatch(/"recording_sid" is not null/i);
    expect(sql).toMatch(/"audio_url" is null/i);
  });

  /**
   * The age bounds. The lower one keeps the sweep from racing a copy that is
   * still in flight; the upper one stops it enqueueing rows whose media Twilio
   * can no longer serve.
   *
   * The cast is a TYPE-level necessity, not a database guard: the Drizzle
   * schema declares `date_created` as `text()` while the column is `timestamptz`
   * in the database, so `lt(column, isoString)` will not typecheck. An uncast
   * ISO literal is type `unknown` and Postgres coerces it correctly, so this
   * cast is not preventing a silent mis-compare.
   * #2213 re-declared `call.date_created` as `timestamptz`, which removed the
   * reason for the raw `sql` and its `::timestamptz` cast: the typed `lt`/`gt`
   * helpers now accept a `Date`. The comparison is therefore asserted by the
   * bound values Drizzle binds, not by a cast in the SQL text — and a test that
   * asserted the cast would have gone green on the workaround it was written to
   * police, which is how it survived until the workaround was no longer needed.
   */
  test("bounds the sweep by age, comparing date_created as timestamptz", async () => {
    stubCandidates([]);
    await runRecordingRepairSweep({ now: NOW });

    const sql = whereSql(mocks.whereClause);
    expect(sql).toMatch(/"date_created"\s*</);
    expect(sql).toMatch(/"date_created"\s*>/);
    // The column needs no cast now, and must not regain one: a `text()` column
    // compared against a literal is the silent wrong answer this guards.
    expect(sql).not.toMatch(/"date_created"::/);
    const params = whereParams(mocks.whereClause).map(String);
    expect(params).toContain(
      new Date(NOW.getTime() - REPAIR_MIN_AGE_MINUTES * 60_000).toISOString(),
    );
    expect(params).toContain(
      new Date(NOW.getTime() - REPAIR_MAX_AGE_DAYS * 86_400_000).toISOString(),
    );
  });

  /**
   * Newest-first, and this is a correctness guard rather than a preference.
   *
   * A call whose recording has aged out of Twilio's retention can never be
   * repaired, so it never leaves the candidate set. Under oldest-first ordering
   * with a hard row limit, those permanently-broken rows hold the head of the
   * queue and starve every newer, repairable call behind them — permanently.
   * Newest-first starves the stuck rows instead, and they age out on their own.
   */
  test("orders newest-first so unrepairable old rows cannot starve the queue", async () => {
    stubCandidates([]);
    await runRecordingRepairSweep({ now: NOW });

    expect(mocks.orderSql).toMatch(/desc\s*$/);
    expect(mocks.orderSql).not.toMatch(/\basc\s*$/);
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

import { describe, expect, test, vi, beforeEach } from "vitest";
import { db } from "@/server/db";
import {
  resetStaleClaims,
  claimNextJob,
  completeJob,
  failJob,
  runWorkerPollLoop,
} from "@/lib/worker/poll-jobs.server";

type JobRow = {
  id: number;
  type: string;
  status: string;
  params: unknown;
  workspace_id: string | null;
  user_id: string | null;
  attempt_count: number;
  max_attempts: number;
  retry_at: string | null;
  claimed_until: string | null;
  claimed_by: string | null;
  created_at: string;
  error_message?: string | null;
  dead_letter_reason?: string | null;
  result?: unknown;
  completed_at?: string | null;
  failed_at?: string | null;
};

const mockState = vi.hoisted(() => {
  const baseTime = new Date("2026-01-01T00:00:00.000Z");
  const state = {
    jobs: [] as JobRow[],
    now: baseTime,
  };

  function getChunks(query: any) {
    return query.queryChunks as Array<{
      constructor: { name: string };
      value: unknown;
    }>;
  }

  function getQueryString(query: any): string {
    return getChunks(query)
      .filter((c) => c.constructor.name === "StringChunk")
      .map((c) => String(c.value))
      .join("");
  }

  function getChunkValue(chunk: any): unknown {
    if (chunk?.constructor?.name === "StringChunk") {
      return chunk.value;
    }
    return chunk?.valueOf?.();
  }

  function findParam(query: any, predicate: (chunk: string) => boolean): unknown {
    const chunks = getChunks(query);
    for (let i = 0; i < chunks.length; i++) {
      if (
        chunks[i].constructor.name === "StringChunk" &&
        predicate(String(chunks[i].value))
      ) {
        const next = chunks[i + 1];
        if (next && next.constructor.name !== "StringChunk") {
          return getChunkValue(next);
        }
      }
    }
    return undefined;
  }

  function mockExecute(query: any) {
    const queryString = getQueryString(query);
    const currentNow = state.now.toISOString();

    // Reset stale claims
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("SET status = 'queued'") &&
      queryString.includes("WHERE status = 'running'") &&
      queryString.includes("claimed_until < now()")
    ) {
      const reset = state.jobs.filter(
        (j) =>
          j.status === "running" &&
          j.claimed_until &&
          new Date(j.claimed_until) < state.now,
      );
      reset.forEach((j) => {
        j.status = "queued";
        j.claimed_until = null;
        j.claimed_by = null;
        // NOTE: no attempt_count bump here — claimNextJob increments on
        // reclaim, so a crash-recovery cycle costs exactly one attempt.
      });
      return reset;
    }

    // Select queued job
    if (
      queryString.includes("SELECT") &&
      queryString.includes("FROM job") &&
      queryString.includes("WHERE status = 'queued'")
    ) {
      const job = state.jobs
        .filter(
          (j) =>
            j.status === "queued" &&
            (!j.retry_at || new Date(j.retry_at) <= state.now),
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )[0];
      return job ? [{ ...job }] : [];
    }

    // Update running (claim)
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("SET status = 'running'")
    ) {
      const id = findParam(query, (s) => s.includes("WHERE id = ")) as number;
      const workerId = findParam(query, (s) => s.includes("claimed_by = ")) as string;
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "running";
        job.claimed_by = workerId;
        job.attempt_count++;
        job.claimed_until = new Date(
          state.now.getTime() + 5 * 60 * 1000,
        ).toISOString();
      }
      return job ? [{ ...job }] : [];
    }

    // Update completed
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("SET status = 'completed'")
    ) {
      const id = findParam(query, (s) => s.includes("WHERE id = ")) as number;
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "completed";
        job.completed_at = currentNow;
        job.result = JSON.parse(findParam(query, (s) => s.includes("result = ")) as string);
      }
      return job ? [job] : [];
    }

    // Update retry
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("SET status = 'queued'") &&
      queryString.includes("retry_at")
    ) {
      const id = findParam(query, (s) => s.includes("WHERE id = ")) as number;
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "queued";
        job.retry_at = new Date(
          state.now.getTime() + 60_000 * job.attempt_count,
        ).toISOString();
        job.error_message = findParam(query, (s) =>
          s.includes("error_message = "),
        ) as string;
        job.claimed_until = null;
        job.claimed_by = null;
      }
      return job ? [job] : [];
    }

    // Update failed
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("SET status = 'dead_letter'")
    ) {
      const id = findParam(query, (s) => s.includes("WHERE id = ")) as number;
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "dead_letter";
        job.failed_at = currentNow;
        job.dead_letter_reason = findParam(query, (s) =>
          s.includes("dead_letter_reason = "),
        ) as string;
        job.error_message = findParam(query, (s) =>
          s.includes("error_message = "),
        ) as string;
        job.claimed_until = null;
        job.claimed_by = null;
      }
      return job ? [job] : [];
    }

    // Heartbeat
    if (
      queryString.includes("UPDATE job") &&
      queryString.includes("claimed_until") &&
      !queryString.includes("SET status")
    ) {
      return [];
    }

    return [];
  }

  const fakeDb = {
    execute: vi.fn(async (query: any) => mockExecute(query)),
    transaction: vi.fn(async (fn: any) =>
      fn({ execute: vi.fn(async (query: any) => mockExecute(query)) }),
    ),
  };

  return { state, fakeDb, baseTime };
});

vi.mock("@/server/db", () => ({
  db: mockState.fakeDb,
}));

function createJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 1,
    type: "test",
    status: "queued",
    params: {},
    workspace_id: "ws-1",
    user_id: null,
    attempt_count: 0,
    max_attempts: 3,
    retry_at: null,
    claimed_until: null,
    claimed_by: null,
    created_at: mockState.baseTime.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  mockState.state.jobs = [];
  mockState.state.now = mockState.baseTime;
  (db.execute as ReturnType<typeof vi.fn>).mockClear();
  (db.transaction as ReturnType<typeof vi.fn>).mockClear();
});

describe("worker poll-jobs lifecycle", () => {
  test("claims a queued job", async () => {
    mockState.state.jobs.push(createJob({ id: 42, type: "test" }));

    const job = await claimNextJob("worker-1");

    expect(job).not.toBeNull();
    expect(job?.id).toBe(42);
    expect(job?.attempt_count).toBe(1);
    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.status).toBe("running");
    expect(stored?.claimed_by).toBe("worker-1");
    expect(stored?.attempt_count).toBe(1);
  });

  test("completes a job", async () => {
    mockState.state.jobs.push(
      createJob({ id: 42, status: "running", attempt_count: 1 }),
    );

    await completeJob(42, { processed: true });

    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.status).toBe("completed");
    expect(stored?.result).toEqual({ processed: true });
    expect(stored?.completed_at).toBe(mockState.baseTime.toISOString());
  });

  test("fails a job and retries when under max attempts", async () => {
    mockState.state.jobs.push(
      createJob({ id: 42, status: "running", attempt_count: 1 }),
    );

    await failJob(42, 1, 3, "Temporary error");

    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.status).toBe("queued");
    expect(stored?.retry_at).toBe(
      new Date(mockState.baseTime.getTime() + 60_000).toISOString(),
    );
    expect(stored?.error_message).toBe("Temporary error");
  });

  test("dead-letters a job after max attempts", async () => {
    mockState.state.jobs.push(
      createJob({ id: 42, status: "running", attempt_count: 3 }),
    );

    await failJob(42, 3, 3, "Permanent error");

    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.status).toBe("dead_letter");
    expect(stored?.failed_at).toBe(mockState.baseTime.toISOString());
    expect(stored?.dead_letter_reason).toBe("Permanent error");
    expect(stored?.error_message).toBe("Permanent error");
  });

  test("resets stale claims without bumping attempt_count", async () => {
    mockState.state.jobs.push(
      createJob({
        id: 42,
        status: "running",
        attempt_count: 1,
        claimed_until: new Date(mockState.baseTime.getTime() - 1_000).toISOString(),
      }),
    );

    await resetStaleClaims();

    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.status).toBe("queued");
    expect(stored?.claimed_until).toBeNull();
    expect(stored?.claimed_by).toBeNull();
    // attempt_count is untouched by the reset itself — claimNextJob is what
    // bumps it when the job is reclaimed.
    expect(stored?.attempt_count).toBe(1);
  });

  test("crash-recovery cycle (reset + reclaim) costs exactly one attempt, not two", async () => {
    mockState.state.jobs.push(
      createJob({
        id: 42,
        status: "running",
        attempt_count: 1,
        claimed_until: new Date(mockState.baseTime.getTime() - 1_000).toISOString(),
      }),
    );

    // Simulate a crash: the poll loop's stale-claim reset runs, then the
    // (possibly different) worker reclaims the job.
    await resetStaleClaims();
    const reclaimed = await claimNextJob("worker-2");

    expect(reclaimed?.id).toBe(42);
    // Started this cycle at attempt_count 1; one crash-recovery cycle should
    // land at 2, not 3 (which would dead-letter after a single real
    // execution when max_attempts=3).
    expect(reclaimed?.attempt_count).toBe(2);
    const stored = mockState.state.jobs.find((j) => j.id === 42);
    expect(stored?.attempt_count).toBe(2);
  });

  test("poll loop exits when aborted", async () => {
    const controller = new AbortController();
    const loopPromise = runWorkerPollLoop(controller.signal, {}, {
      pollIntervalMs: 10,
      heartbeatIntervalMs: 60_000,
    });

    controller.abort();
    await loopPromise;
  });

  test("poll loop resets stale claims on every iteration, not just at boot", async () => {
    const controller = new AbortController();
    const loopPromise = runWorkerPollLoop(controller.signal, {}, {
      pollIntervalMs: 5,
      heartbeatIntervalMs: 60_000,
    });

    // Let a few iterations run (no jobs queued, so each iteration is a
    // quick no-op poll + sleep).
    await new Promise((resolve) => setTimeout(resolve, 40));
    controller.abort();
    await loopPromise;

    const resetCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([query]) => {
        const chunks = (query as any).queryChunks as Array<{
          constructor: { name: string };
          value: unknown;
        }>;
        const str = chunks
          .filter((c) => c.constructor.name === "StringChunk")
          .map((c) => String(c.value))
          .join("");
        return (
          str.includes("UPDATE job") &&
          str.includes("SET status = 'queued'") &&
          str.includes("WHERE status = 'running'") &&
          str.includes("claimed_until < now()")
        );
      },
    );

    // One reset before the loop starts, plus at least one per iteration.
    expect(resetCalls.length).toBeGreaterThan(1);
  });
});

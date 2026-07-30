import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/server/db", () => ({ db: { execute: (...a: unknown[]) => mocks.execute(...a) } }));

import {
  JOB_PRUNE_BATCH_SIZE,
  pruneCompletedJobs,
} from "@/lib/worker/job-retention.server";

/** A DELETE ... RETURNING result of `n` rows. */
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("pruneCompletedJobs", () => {
  beforeEach(() => mocks.execute.mockReset());

  test("stops as soon as a batch comes back short", async () => {
    mocks.execute.mockResolvedValueOnce(rows(12));

    expect(await pruneCompletedJobs()).toBe(12);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  test("keeps going while batches come back full", async () => {
    mocks.execute
      .mockResolvedValueOnce(rows(JOB_PRUNE_BATCH_SIZE))
      .mockResolvedValueOnce(rows(JOB_PRUNE_BATCH_SIZE))
      .mockResolvedValueOnce(rows(5));

    expect(await pruneCompletedJobs()).toBe(JOB_PRUNE_BATCH_SIZE * 2 + 5);
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });

  test("a table with far more than one run's worth cannot monopolise the tick", async () => {
    mocks.execute.mockResolvedValue(rows(JOB_PRUNE_BATCH_SIZE));

    await pruneCompletedJobs();

    // Bounded rather than looping until the table is empty; the next daily
    // tick picks up where this one stopped.
    expect(mocks.execute.mock.calls.length).toBeLessThanOrEqual(20);
    expect(mocks.execute.mock.calls.length).toBeGreaterThan(1);
  });

  test("deletes only completed rows, never dead-lettered ones", async () => {
    mocks.execute.mockResolvedValueOnce(rows(0));

    await pruneCompletedJobs();

    // Requeue re-runs a dead-lettered job from its stored params, so pruning
    // one would destroy the ability to recover a lost debit.
    const query = JSON.stringify(mocks.execute.mock.calls[0]);
    expect(query).toContain("completed");
    expect(query).not.toContain("dead_letter");
  });

  test("honours a caller-supplied retention window", async () => {
    mocks.execute.mockResolvedValueOnce(rows(0));

    await pruneCompletedJobs(30);

    expect(JSON.stringify(mocks.execute.mock.calls[0])).toContain("30");
  });
});

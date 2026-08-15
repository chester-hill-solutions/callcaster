import { beforeEach, describe, expect, test, vi } from "vitest";

// `requeueDeadLetteredJob` (#1239 A3) does a plain `select().from().where()`
// (awaited directly, no orderBy/limit) BEFORE the status-flip `update`;
// `listRecentDeadLetteredJobs` does `select().from().where().orderBy().limit()`.
// One `select` mock supports both shapes: `where()` returns an object that's
// both directly awaitable (resolves `selectRows()`) and chainable via
// `.orderBy().limit()`, matching how a real drizzle query builder behaves.
const mocks = vi.hoisted(() => {
  const selectRows = vi.fn(async () => [{ id: 7 }]);
  const limit = vi.fn(async (n: number) => selectRows(n));
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => {
    const result = selectRows();
    return Object.assign(Promise.resolve(result), { orderBy });
  });
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const updateReturning = vi.fn(async () => [{ id: 7, type: "billing_reconcile" }]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    selectRows,
    select,
    from,
    where,
    orderBy,
    limit,
    update,
    updateSet,
    updateWhere,
    updateReturning,
  };
});

vi.mock("@/server/admin-db", () => ({
  adminDb: { select: mocks.select, update: mocks.update },
}));

import {
  DEAD_LETTER_JOB_STATUS,
  listRecentDeadLetteredJobs,
  requeueDeadLetteredJob,
} from "@/lib/admin-jobs.server";

describe("admin dead-letter jobs", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockClear();
    }
    mocks.selectRows.mockResolvedValue([{ id: 7 }]);
    mocks.updateReturning.mockResolvedValue([{ id: 7, type: "billing_reconcile" }]);
  });

  test("queries dead-letter jobs with the requested limit", async () => {
    const rows = await listRecentDeadLetteredJobs(100);

    expect(DEAD_LETTER_JOB_STATUS).toBe("dead_letter");
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.orderBy).toHaveBeenCalledOnce();
    expect(mocks.limit).toHaveBeenCalledWith(100);
    expect(rows).toEqual([{ id: 7 }]);
  });
});

/**
 * requeueDeadLetteredJob's #1239 A3 validation gate: the row's stored
 * type/params are checked against the job registry (`validateStoredJobParams`)
 * before the status flip, so a corrupted or since-removed job type is
 * rejected with a typed reason instead of being reinstated only to
 * dead-letter again on the next attempt.
 */
describe("requeueDeadLetteredJob — registry validation gate (#1239 A3)", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockClear();
    }
  });

  test("rejects a job whose stored type is no longer registered, without touching the update", async () => {
    mocks.selectRows.mockResolvedValue([{ type: "no_longer_a_job_type", params: {} }]);

    const result = await requeueDeadLetteredJob(7, "admin-1");

    expect(result).toEqual({
      ok: false,
      reason: "invalid_params",
      error: 'No defineJob registration for job type "no_longer_a_job_type"',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("rejects a job whose stored params no longer pass its schema", async () => {
    mocks.selectRows.mockResolvedValue([
      { type: "audience_upload", params: { uploadId: 0, audienceId: 5 } },
    ]);

    const result = await requeueDeadLetteredJob(7, "admin-1");

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "invalid_params") {
      expect(result.error).toMatch(/audience_upload: missing or invalid uploadId/);
    } else {
      throw new Error("expected an invalid_params rejection");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("requeues a job whose stored params still pass its schema", async () => {
    mocks.selectRows.mockResolvedValue([
      { type: "billing_reconcile", params: { workspaceId: "ws_1" } },
    ]);
    mocks.updateReturning.mockResolvedValue([{ id: 7, type: "billing_reconcile" }]);

    const result = await requeueDeadLetteredJob(7, "admin-1");

    expect(result).toEqual({ ok: true, jobId: 7, type: "billing_reconcile" });
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  test("reports not_found when no dead-lettered row matches", async () => {
    mocks.selectRows.mockResolvedValue([]);

    const result = await requeueDeadLetteredJob(999, "admin-1");

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

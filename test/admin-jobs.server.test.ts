import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn(async () => [{ id: 7 }]);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy, limit };
});

vi.mock("@/server/admin-db", () => ({
  adminDb: { select: mocks.select },
}));

import {
  DEAD_LETTER_JOB_STATUS,
  listRecentDeadLetteredJobs,
} from "@/lib/admin-jobs.server";

describe("admin dead-letter jobs", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockClear();
    }
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

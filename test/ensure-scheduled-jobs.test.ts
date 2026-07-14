import { beforeEach, describe, expect, test, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db", () => ({
  db: { execute: executeMock },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ensureSelfSchedulingJobsSeeded,
  SELF_SCHEDULING_JOB_TYPES,
} from "@/lib/worker/ensure-scheduled-jobs.server";

function queryText(query: unknown): string {
  const chunks = (query as { queryChunks: Array<{ value: unknown }> })
    .queryChunks;
  return chunks
    .filter((c) => c.constructor.name === "StringChunk")
    .map((c) => String(c.value))
    .join("");
}

describe("ensureSelfSchedulingJobsSeeded", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  test("issues one guarded insert per self-scheduling job type", async () => {
    executeMock.mockResolvedValue([]);

    const result = await ensureSelfSchedulingJobsSeeded();

    expect(executeMock).toHaveBeenCalledTimes(SELF_SCHEDULING_JOB_TYPES.length);
    for (const call of executeMock.mock.calls) {
      const text = queryText(call[0]);
      // Check-and-insert must be a single statement so concurrent boots
      // cannot both seed a self-perpetuating chain.
      expect(text).toContain("INSERT INTO job");
      expect(text).toContain("WHERE NOT EXISTS");
      expect(text).toContain("IN ('queued', 'running')");
    }
    expect(result.seeded).toEqual([]);
  });

  test("reports which job types were newly seeded", async () => {
    executeMock
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([]);

    const result = await ensureSelfSchedulingJobsSeeded();

    expect(result.seeded).toEqual(["low_credit_notify"]);
  });

  test("a failed seed does not abort the remaining types", async () => {
    executeMock
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce([{ id: 7 }]);

    const result = await ensureSelfSchedulingJobsSeeded();

    expect(executeMock).toHaveBeenCalledTimes(SELF_SCHEDULING_JOB_TYPES.length);
    expect(result.seeded).toEqual(["twilio_webhook_audit"]);
  });
});

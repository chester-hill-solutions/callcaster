import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { runWithRequestContext } from "@/lib/request-context.server";

type JobRow = {
  id: number;
  type: string;
  status: string;
  params: unknown;
  workspace_id: string | null;
  idempotency_key: string | null;
};

const mockState = vi.hoisted(() => ({
  jobs: [] as JobRow[],
  nextId: 1,
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: vi.fn(async () => []),
    insert: vi.fn(() => ({
      values: vi.fn((values: Partial<JobRow>) => ({
        returning: vi.fn(async () => {
          const row: JobRow = {
            id: mockState.nextId++,
            type: values.type ?? "unknown",
            status: values.status ?? "queued",
            params: values.params ?? {},
            workspace_id: values.workspace_id ?? null,
            idempotency_key: values.idempotency_key ?? null,
          };
          mockState.jobs.push(row);
          return [{ id: row.id }];
        }),
      })),
    })),
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe("enqueueJob", () => {
  beforeEach(() => {
    mockState.jobs = [];
    mockState.nextId = 1;
    vi.clearAllMocks();
  });

  test("inserts a queued row without idempotency key", async () => {
    const result = await enqueueJob({
      type: "test_job",
      params: { foo: "bar" },
      workspaceId: "w1",
    });
    expect(result.enqueued).toBe(true);
    expect(result.jobId).toBe(1);
    expect(mockState.jobs).toHaveLength(1);
    expect(mockState.jobs[0].type).toBe("test_job");
  });

  test("dedupes when idempotency key already exists", async () => {
    mockState.jobs.push({
      id: 99,
      type: "call_status_side_effects",
      status: "queued",
      params: { callSid: "CA1" },
      workspace_id: "w1",
      idempotency_key: "call_status_side_effects:CA1:completed",
    });

    const result = await enqueueJob({
      type: "call_status_side_effects",
      idempotencyKey: "call_status_side_effects:CA1:completed",
      workspaceId: "w1",
      params: { callSid: "CA1" },
    });
    expect(result.enqueued).toBe(false);
    expect(mockState.jobs).toHaveLength(1);
  });

  test("copies the active request id into job params", async () => {
    await runWithRequestContext({ requestId: "req-enqueue" }, () =>
      enqueueJob({
        type: "test_job",
        params: { foo: "bar" },
      }),
    );

    expect(mockState.jobs[0]?.params).toEqual({
      foo: "bar",
      requestId: "req-enqueue",
    });
  });
});

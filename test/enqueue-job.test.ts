import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { enqueueJob } from "@/lib/worker/enqueue-job.server";
import { runWithRequestContext } from "@/lib/request-context.server";
import { db } from "@/server/db";

type JobRow = {
  id: number;
  type: string;
  status: string;
  params: unknown;
  workspace_id: string | null;
  idempotency_key: string | null;
  attempt_count?: number;
  dead_letter_reason?: string | null;
};

const mockState = vi.hoisted(() => ({
  jobs: [] as JobRow[],
  nextId: 1,
}));

vi.mock("@/server/db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      const text = String(query ?? "");
      if (text.includes("INSERT INTO job")) {
        // Extract idempotency key from params embedded in the SQL wrapper.
        // The mock receives a drizzle sql fragment; fall back to scanning jobs.
        return [];
      }
      if (text.includes("UPDATE job") && text.includes("dead_letter")) {
        const dead = mockState.jobs.find((j) => j.status === "dead_letter");
        if (!dead) return [];
        dead.status = "queued";
        dead.attempt_count = 0;
        dead.dead_letter_reason = null;
        return [{ id: dead.id }];
      }
      return [];
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            const live = mockState.jobs.filter((j) =>
              ["queued", "running"].includes(j.status),
            );
            return live.slice(0, 1).map((j) => ({ id: j.id }));
          }),
        })),
      })),
    })),
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

  test("dedupes when idempotency key already exists on a live job", async () => {
    mockState.jobs.push({
      id: 99,
      type: "call_status_side_effects",
      status: "queued",
      params: { callSid: "CA1" },
      workspace_id: "w1",
      idempotency_key: "call_status_side_effects:CA1:completed",
    });

    // First execute (INSERT) returns empty (conflict); second (revive UPDATE)
    // finds no dead_letter row.
    vi.mocked(db.execute)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await enqueueJob({
      type: "call_status_side_effects",
      idempotencyKey: "call_status_side_effects:CA1:completed",
      workspaceId: "w1",
      params: { callSid: "CA1" },
    });
    expect(result.enqueued).toBe(false);
    expect(result.deduped).toBe(true);
    expect(mockState.jobs).toHaveLength(1);
    expect(mockState.jobs[0].status).toBe("queued");
  });

  test("revives a dead-lettered job with the same idempotency key", async () => {
    mockState.jobs.push({
      id: 42,
      type: "call_status_side_effects",
      status: "dead_letter",
      params: { callSid: "CA1" },
      workspace_id: "w1",
      idempotency_key: "call_status_side_effects:CA1:completed",
      attempt_count: 3,
      dead_letter_reason: "Permanent error",
    });

    vi.mocked(db.execute)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 42 }] as never);

    const result = await enqueueJob({
      type: "call_status_side_effects",
      idempotencyKey: "call_status_side_effects:CA1:completed",
      workspaceId: "w1",
      params: { callSid: "CA1", twilioParams: { CallStatus: "completed" } },
    });

    expect(result.enqueued).toBe(true);
    expect(result.revived).toBe(true);
    expect(result.jobId).toBe(42);
  });

  test("live dedupe skips when queued/running row exists", async () => {
    mockState.jobs.push({
      id: 7,
      type: "billing_reconcile",
      status: "queued",
      params: {},
      workspace_id: null,
      idempotency_key: null,
    });

    const result = await enqueueJob({
      type: "billing_reconcile",
      dedupe: { kind: "live" },
      params: {},
    });

    expect(result.enqueued).toBe(false);
    expect(result.deduped).toBe(true);
    expect(result.jobId).toBe(7);
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

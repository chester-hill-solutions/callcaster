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
  retry_at?: string | null;
  attempt_count?: number;
  dead_letter_reason?: string | null;
};

const mockState = vi.hoisted(() => ({
  jobs: [] as JobRow[],
  nextId: 1,
}));

vi.mock("@/server/db", () => ({
  db: (() => {
    const insert = vi.fn(() => ({
      values: vi.fn((values: Partial<JobRow>) => ({
        returning: vi.fn(async () => {
          const row: JobRow = {
            id: mockState.nextId++,
            type: values.type ?? "unknown",
            status: values.status ?? "queued",
            params: values.params ?? {},
            workspace_id: values.workspace_id ?? null,
            idempotency_key: values.idempotency_key ?? null,
            retry_at: values.retry_at ?? null,
          };
          mockState.jobs.push(row);
          return [{ id: row.id }];
        }),
      })),
    }));

    return {
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
      insert,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
        let executeCount = 0;
        const tx = {
          execute: vi.fn(async (query: unknown) => {
            executeCount += 1;
            if (executeCount === 1) return [];
            // Reconstruct the live-dedupe SELECT's bound params by the SQL
            // text immediately preceding each placeholder, so the mock
            // enforces the same workspace/campaign/exclude matching as the
            // real query.
            const chunks =
              (query as { queryChunks?: unknown[] }).queryChunks ?? [];
            let lastText = "";
            let workspaceParam: unknown;
            let campaignParam: number | null = null;
            let excludedId: number | undefined;
            for (const chunk of chunks) {
              const isStringChunk =
                chunk != null &&
                typeof chunk === "object" &&
                chunk.constructor.name === "StringChunk";
              if (isStringChunk) {
                const value = (chunk as { value: unknown }).value;
                lastText = Array.isArray(value) ? value.join("") : String(value);
                continue;
              }
              const param =
                typeof chunk === "object" && chunk !== null
                  ? chunk.valueOf()
                  : chunk;
              if (lastText.includes("workspace_id IS NOT DISTINCT FROM")) {
                workspaceParam = param;
              } else if (lastText.includes("params->>'campaignId'")) {
                campaignParam = typeof param === "number" ? param : null;
              } else if (lastText.includes("id <>")) {
                excludedId = typeof param === "number" ? param : undefined;
              }
              lastText = "";
            }
            const live = mockState.jobs.filter(
              (job) =>
                ["queued", "running"].includes(job.status) &&
                job.id !== excludedId &&
                (workspaceParam === undefined ||
                  (job.workspace_id ?? null) === workspaceParam) &&
                (campaignParam == null ||
                  Number(
                    (job.params as Record<string, unknown> | null)?.campaignId,
                  ) === campaignParam),
            );
            return live.slice(0, 1).map((job) => ({ id: job.id }));
          }),
          insert,
        };
        return callback(tx);
      }),
    };
  })(),
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

  test("live dedupe inserts a scheduled successor while excluding current job", async () => {
    mockState.jobs.push({
      id: 8,
      type: "billing_reconcile",
      status: "running",
      params: {},
      workspace_id: null,
      idempotency_key: null,
    });

    const runAt = "2026-07-15T00:00:00.000Z";
    const result = await enqueueJob({
      type: "billing_reconcile",
      params: {},
      runAt,
      dedupe: { kind: "live", excludeJobId: 8 },
    });

    expect(result.enqueued).toBe(true);
    expect(mockState.jobs.at(-1)?.retry_at).toBe(runAt);
  });

  test("campaign-scoped live dedupe lets a second campaign in the same workspace enqueue", async () => {
    mockState.jobs.push({
      id: 11,
      type: "campaign_dispatch",
      status: "queued",
      params: { campaignId: 100, workspaceId: "w1" },
      workspace_id: "w1",
      idempotency_key: null,
    });

    const result = await enqueueJob({
      type: "campaign_dispatch",
      workspaceId: "w1",
      params: { campaignId: 200, workspaceId: "w1" },
      dedupe: { kind: "live", workspaceId: "w1", campaignId: 200 },
    });

    expect(result.enqueued).toBe(true);
    expect(mockState.jobs).toHaveLength(2);
  });

  test("campaign-scoped live dedupe still dedupes the same campaign", async () => {
    mockState.jobs.push({
      id: 12,
      type: "campaign_dispatch",
      status: "queued",
      params: { campaignId: 100, workspaceId: "w1" },
      workspace_id: "w1",
      idempotency_key: null,
    });

    const result = await enqueueJob({
      type: "campaign_dispatch",
      workspaceId: "w1",
      params: { campaignId: 100, workspaceId: "w1" },
      dedupe: { kind: "live", workspaceId: "w1", campaignId: 100 },
    });

    expect(result.enqueued).toBe(false);
    expect(result.deduped).toBe(true);
    expect(result.jobId).toBe(12);
  });

  test("campaign-scoped successor excludes the running job but dedupes a queued twin", async () => {
    mockState.jobs.push({
      id: 13,
      type: "campaign_dispatch",
      status: "running",
      params: { campaignId: 100, workspaceId: "w1" },
      workspace_id: "w1",
      idempotency_key: null,
    });

    // Successor from job 13 itself: must ignore its own row and insert.
    const successor = await enqueueJob({
      type: "campaign_dispatch",
      workspaceId: "w1",
      params: { campaignId: 100, workspaceId: "w1" },
      dedupe: { kind: "live", workspaceId: "w1", campaignId: 100, excludeJobId: 13 },
    });
    expect(successor.enqueued).toBe(true);

    // A retry of job 13 scheduling again now finds the queued successor.
    const retry = await enqueueJob({
      type: "campaign_dispatch",
      workspaceId: "w1",
      params: { campaignId: 100, workspaceId: "w1" },
      dedupe: { kind: "live", workspaceId: "w1", campaignId: 100, excludeJobId: 13 },
    });
    expect(retry.enqueued).toBe(false);
    expect(retry.deduped).toBe(true);
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

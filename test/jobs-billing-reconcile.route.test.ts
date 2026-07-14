import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  enqueueCronJobRow: vi.fn(),
}));

vi.mock("@/lib/worker/enqueue-cron-job.server", () => ({
  enqueueCronJobRow: (...args: unknown[]) => mocks.enqueueCronJobRow(...args),
}));

const CRON_SECRET = "test-cron-secret";

function cronRequest(body: unknown, secret?: string) {
  return new Request("http://localhost/api/jobs/billing-reconcile", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
    body: JSON.stringify(body ?? {}),
  });
}

async function callAction(body: unknown, secret?: string) {
  const mod = await import(
    "../app/routes/api+/jobs+/billing-reconcile.action.server"
  );
  return asRouteResponse(
    mod.action({ request: cronRequest(body, secret), params: {} } as any),
  );
}

describe("app/routes/api+/jobs+/billing-reconcile.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = CRON_SECRET;
    mocks.enqueueCronJobRow.mockReset();
    mocks.enqueueCronJobRow.mockResolvedValue({
      ok: true,
      enqueued: true,
      deduped: false,
      jobId: 99,
    });
  });

  test("returns 401 without the cron secret", async () => {
    const res = await callAction({ workspaceId: null });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.enqueueCronJobRow).not.toHaveBeenCalled();
  });

  test("enqueues billing_reconcile for a single workspace", async () => {
    const res = await callAction({ workspaceId: "ws-1" }, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      enqueued: true,
      deduped: false,
      jobId: 99,
    });
    expect(mocks.enqueueCronJobRow).toHaveBeenCalledWith({
      type: "billing_reconcile",
      workspaceId: "ws-1",
      params: { workspaceId: "ws-1" },
    });
  });

  test("enqueues coordinator job when workspaceId is absent", async () => {
    const res = await callAction({}, CRON_SECRET);

    expect(res.status).toBe(200);
    expect(mocks.enqueueCronJobRow).toHaveBeenCalledWith({
      type: "billing_reconcile",
      workspaceId: undefined,
      params: { workspaceId: undefined },
    });
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  listAllWorkspacesOrdered: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(),
  createWorkspaceTwilioInstance: vi.fn(),
  loadBillingReconciliationReport: vi.fn(),
  persistWorkspaceBillingReconciliationSnapshot: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  listAllWorkspacesOrdered: (...args: unknown[]) =>
    mocks.listAllWorkspacesOrdered(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...args),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...args: unknown[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
}));
vi.mock("@/lib/billing-reconciliation.server", () => ({
  loadBillingReconciliationReport: (...args: unknown[]) =>
    mocks.loadBillingReconciliationReport(...args),
}));
vi.mock("@/lib/billing-reconciliation-snapshot.server", () => ({
  persistWorkspaceBillingReconciliationSnapshot: (...args: unknown[]) =>
    mocks.persistWorkspaceBillingReconciliationSnapshot(...args),
}));

const CRON_SECRET = "test-cron-secret";
const CREDS = { sid: "AC_ws", authToken: "token" };

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

    mocks.listAllWorkspacesOrdered.mockReset();
    mocks.loadWorkspaceTwilioData.mockReset();
    mocks.loadWorkspaceTwilioData.mockResolvedValue(CREDS);
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.createWorkspaceTwilioInstance.mockResolvedValue({
      usage: { records: { list: vi.fn(async () => []) } },
    });
    mocks.loadBillingReconciliationReport.mockReset();
    mocks.loadBillingReconciliationReport.mockResolvedValue({ rows: [] });
    mocks.persistWorkspaceBillingReconciliationSnapshot.mockReset();
    mocks.persistWorkspaceBillingReconciliationSnapshot.mockResolvedValue({
      materialVariance: false,
    });
  });

  test("returns 401 without the cron secret and does not enumerate workspaces", async () => {
    const res = await callAction({ workspaceId: null });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(mocks.createWorkspaceTwilioInstance).not.toHaveBeenCalled();
  });

  test("single-workspace path is unchanged when workspaceId is a string", async () => {
    const res = await callAction({ workspaceId: "ws-1" }, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      materialVariance: false,
      message: "Reconciliation complete — no material variance.",
    });
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", source: "cron" }),
    );
  });

  test("single-workspace path still 400s when the workspace has no Twilio credentials", async () => {
    mocks.loadWorkspaceTwilioData.mockResolvedValue({});

    const res = await callAction({ workspaceId: "ws-1" }, CRON_SECRET);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Workspace has no Twilio credentials",
    });
  });

  test("null workspaceId fans out across all eligible workspaces", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-1" },
      { id: "ws-2" },
    ]);

    const res = await callAction({ workspaceId: null }, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      processed: 2,
      skipped: 0,
      failed: 0,
      failures: [],
    });
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledTimes(2);
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-1" }));
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-2" }));
  });

  test("one failing workspace does not stop the sweep and lands in failures", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-bad" },
      { id: "ws-good" },
    ]);
    mocks.createWorkspaceTwilioInstance.mockImplementation(
      async (args: { workspace_id: string }) => {
        if (args.workspace_id === "ws-bad") {
          throw new Error("twilio exploded");
        }
        return { usage: { records: { list: vi.fn(async () => []) } } };
      },
    );

    const res = await callAction({}, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      processed: 1,
      skipped: 0,
      failed: 1,
      failures: [{ workspaceId: "ws-bad", error: "twilio exploded" }],
    });
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.persistWorkspaceBillingReconciliationSnapshot,
    ).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-good" }));
  });

  test("credential-less workspace is skipped, not failed", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-no-creds" },
      { id: "ws-creds" },
    ]);
    mocks.loadWorkspaceTwilioData.mockImplementation(
      async (workspaceId: string) =>
        workspaceId === "ws-no-creds" ? {} : CREDS,
    );

    const res = await callAction({ workspaceId: null }, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      processed: 1,
      skipped: 1,
      failed: 0,
      failures: [],
    });
    expect(mocks.createWorkspaceTwilioInstance).toHaveBeenCalledTimes(1);
    expect(mocks.createWorkspaceTwilioInstance).toHaveBeenCalledWith({
      workspace_id: "ws-creds",
    });
  });

  test("returns 500 when the sweep itself cannot run", async () => {
    mocks.listAllWorkspacesOrdered.mockRejectedValue(
      new Error("db unreachable"),
    );

    const res = await callAction({ workspaceId: null }, CRON_SECRET);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db unreachable" });
  });
});

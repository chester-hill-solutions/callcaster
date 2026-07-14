import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  listAllWorkspacesOrdered: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(),
  runNumberRentalBilling: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  listAllWorkspacesOrdered: (...args: unknown[]) =>
    mocks.listAllWorkspacesOrdered(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...args),
}));
vi.mock("@/lib/number-rental-billing.server", () => ({
  runNumberRentalBilling: (...args: unknown[]) =>
    mocks.runNumberRentalBilling(...args),
}));

const CRON_SECRET = "test-cron-secret";

const SINGLE_RESULT = {
  ok: true,
  processed: 3,
  charged: 2,
  unpaid: 1,
  released: 0,
  remindersSent: 0,
  remindersFailed: 0,
  autoReleaseImplemented: false,
};

function cronRequest(body: unknown, secret?: string) {
  return new Request("http://localhost/api/jobs/number-rental-billing", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
    body: JSON.stringify(body ?? {}),
  });
}

async function callAction(body: unknown, secret?: string) {
  const mod = await import(
    "../app/routes/api+/jobs+/number-rental-billing.action.server"
  );
  return asRouteResponse(
    mod.action({ request: cronRequest(body, secret), params: {} } as any),
  );
}

describe("app/routes/api+/jobs+/number-rental-billing.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = CRON_SECRET;

    mocks.listAllWorkspacesOrdered.mockReset();
    mocks.loadWorkspaceTwilioData.mockReset();
    mocks.loadWorkspaceTwilioData.mockResolvedValue({});
    mocks.runNumberRentalBilling.mockReset();
    mocks.runNumberRentalBilling.mockResolvedValue(SINGLE_RESULT);
  });

  test("returns 401 without the cron secret and does not enumerate workspaces", async () => {
    const res = await callAction({ workspaceId: null });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(mocks.runNumberRentalBilling).not.toHaveBeenCalled();
  });

  test("single-workspace path is unchanged when workspaceId is a string", async () => {
    const res = await callAction({ workspaceId: "ws-1" }, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SINGLE_RESULT);
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledTimes(1);
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
  });

  test("null workspaceId fans out across all workspaces, without a Twilio-credential gate", async () => {
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
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledTimes(2);
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    });
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledWith({
      workspaceId: "ws-2",
    });
    // Rental billing does not need Twilio credentials, so no workspace is
    // filtered on twilio_data.
    expect(mocks.loadWorkspaceTwilioData).not.toHaveBeenCalled();
  });

  test("one failing workspace does not stop the sweep and lands in failures", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-bad" },
      { id: "ws-good" },
    ]);
    mocks.runNumberRentalBilling.mockImplementation(
      async (args: { workspaceId: string }) => {
        if (args.workspaceId === "ws-bad") {
          throw new Error("ledger exploded");
        }
        return SINGLE_RESULT;
      },
    );

    const res = await callAction({}, CRON_SECRET);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      processed: 1,
      skipped: 0,
      failed: 1,
      failures: [{ workspaceId: "ws-bad", error: "ledger exploded" }],
    });
    expect(mocks.runNumberRentalBilling).toHaveBeenCalledTimes(2);
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

import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  listAllWorkspacesOrdered: vi.fn(),
  loadWorkspaceTwilioData: vi.fn(),
  triggerTwilioOpenSync: vi.fn(),
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  listAllWorkspacesOrdered: (...args: unknown[]) =>
    mocks.listAllWorkspacesOrdered(...args),
}));
vi.mock("@/lib/merge-workspace-twilio-data.server", () => ({
  loadWorkspaceTwilioData: (...args: unknown[]) =>
    mocks.loadWorkspaceTwilioData(...args),
}));
vi.mock("@/lib/twilio-open-sync.server", () => ({
  triggerTwilioOpenSync: (...args: unknown[]) =>
    mocks.triggerTwilioOpenSync(...args),
}));

const CRON_SECRET = "test-cron-secret";
const CREDS = { sid: "AC_ws", authToken: "token" };

function cronRequest(body: unknown, secret?: string) {
  return new Request("http://localhost/api/jobs/twilio-open-sync", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {},
    body: JSON.stringify(body ?? {}),
  });
}

async function callAction(body: unknown, secret?: string) {
  const mod = await import(
    "../app/routes/api+/jobs+/twilio-open-sync.action.server"
  );
  return asRouteResponse(
    mod.action({ request: cronRequest(body, secret), params: {} } as any),
  );
}

describe("app/routes/api+/jobs+/twilio-open-sync.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = CRON_SECRET;

    mocks.listAllWorkspacesOrdered.mockReset();
    mocks.loadWorkspaceTwilioData.mockReset();
    mocks.loadWorkspaceTwilioData.mockResolvedValue(CREDS);
    mocks.triggerTwilioOpenSync.mockReset();
    mocks.triggerTwilioOpenSync.mockResolvedValue({
      ok: true,
      message: "synced",
    });
  });

  test("returns 401 without the cron secret and does not enumerate workspaces", async () => {
    const res = await callAction({ workspaceId: null });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(mocks.triggerTwilioOpenSync).not.toHaveBeenCalled();
  });

  test("single-workspace path is unchanged when workspaceId is a string", async () => {
    const res = await callAction(
      { workspaceId: "ws-1", callLimit: 10 },
      CRON_SECRET,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, message: "synced" });
    expect(mocks.listAllWorkspacesOrdered).not.toHaveBeenCalled();
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledTimes(1);
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      callLimit: 10,
      messageLimit: 50,
      maxAgeMinutes: 120,
    });
  });

  test("single-workspace path still 500s on an { ok: false } result", async () => {
    mocks.triggerTwilioOpenSync.mockResolvedValue({
      ok: false,
      error: "sync failed",
    });

    const res = await callAction({ workspaceId: "ws-1" }, CRON_SECRET);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "sync failed" });
  });

  test("null workspaceId fans out across all eligible workspaces with body limits", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-1" },
      { id: "ws-2" },
    ]);

    const res = await callAction(
      { workspaceId: null, callLimit: 5, messageLimit: 7, maxAgeMinutes: 30 },
      CRON_SECRET,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      processed: 2,
      skipped: 0,
      failed: 0,
      failures: [],
    });
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledTimes(2);
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      callLimit: 5,
      messageLimit: 7,
      maxAgeMinutes: 30,
    });
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith({
      workspaceId: "ws-2",
      callLimit: 5,
      messageLimit: 7,
      maxAgeMinutes: 30,
    });
  });

  test("one failing workspace does not stop the sweep and lands in failures", async () => {
    mocks.listAllWorkspacesOrdered.mockResolvedValue([
      { id: "ws-bad" },
      { id: "ws-good" },
    ]);
    mocks.triggerTwilioOpenSync.mockImplementation(
      async (args: { workspaceId: string }) =>
        args.workspaceId === "ws-bad"
          ? { ok: false, error: "twilio exploded" }
          : { ok: true, message: "synced" },
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
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledTimes(2);
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
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledTimes(1);
    expect(mocks.triggerTwilioOpenSync).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-creds" }),
    );
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

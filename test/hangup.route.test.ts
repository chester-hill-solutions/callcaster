import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { queueJsonAuthSession } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    parseActionRequest: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("../app/lib/database/workspace.server", () => ({
  createWorkspaceTwilioInstance: (...args: any[]) =>
    mocks.createWorkspaceTwilioInstance(...args),
  requireWorkspaceAccess: (...args: any[]) =>
    mocks.requireWorkspaceAccess(...args),
}));
vi.mock("../app/lib/request-utils.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallBySid: vi.fn(),
  updateOutreachAttemptForWorkspace: vi.fn(),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: vi.fn(),
}));

const tenantDbMocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    campaign: {
      findFirst: (...args: any[]) => tenantDbMocks.campaignFindFirst(...args),
    },
  }),
}));

import { findCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { rpcDequeueContact } from "@/lib/db-rpc.server";

function mockCall(overrides?: Partial<{
  workspace: string;
  contact_id: number | null;
  conference_id: string | null;
  campaign_id: number | null;
  outreach_attempt_id: number | null;
}>) {
  vi.mocked(findCallBySid).mockResolvedValueOnce({
    workspace: "w1",
    contact_id: 2,
    conference_id: "u1~00000000-0000-0000-0000-000000000000",
    campaign_id: 5,
    outreach_attempt_id: 9,
    ...overrides,
  } as any);
}

describe("app/routes/api+/hangup/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
    vi.mocked(findCallBySid).mockReset();
    vi.mocked(updateOutreachAttemptForWorkspace).mockReset();
    vi.mocked(rpcDequeueContact).mockReset();
    tenantDbMocks.campaignFindFirst.mockReset();
    tenantDbMocks.campaignFindFirst.mockResolvedValue({ group_household_queue: false });
  });

  test("hangs up, dequeues, and updates the call's own outreach attempt", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({
      workspaceId: "w1",
      callSid: "CA1",
    });
    const callUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: (_sid: string) => ({ update: callUpdate }) });
    mockCall();

    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcDequeueContact).toHaveBeenCalled();
    // Scoped to the specific attempt (9), not every attempt for contact 2.
    expect(updateOutreachAttemptForWorkspace).toHaveBeenCalledWith(
      "w1",
      9,
      { disposition: "completed" },
      { tdb: expect.anything() },
    );
  });

  test("household fan-out follows campaign.group_household_queue instead of always true", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: async () => ({}) }),
    });
    mockCall();
    tenantDbMocks.campaignFindFirst.mockResolvedValueOnce({ group_household_queue: true });

    const mod = await import("../app/routes/api+/hangup");
    await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));

    expect(rpcDequeueContact).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ groupOnHousehold: true }),
    );
  });

  test("does not update outreach when the call has no attempt id", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: async () => ({}) }),
    });
    mockCall({ outreach_attempt_id: null });

    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    expect(rpcDequeueContact).toHaveBeenCalled();
    expect(updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("returns 200 when Twilio returns 21220 (call already ended)", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    const err21220 = new Error("Call is not in-progress. Cannot redirect.") as Error & { code: number };
    err21220.code = 21220;
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw err21220;
        },
      }),
    });
    mockCall();
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcDequeueContact).toHaveBeenCalled();
  });

  test("returns 500 when Twilio throws non-21220", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw new Error("Call is not in-progress");
        },
      }),
    });
    mockCall();
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("returns 404 when call not found in workspace", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    vi.mocked(findCallBySid).mockResolvedValueOnce({
      workspace: "w2",
      contact_id: 2,
      conference_id: "u1~00000000-0000-0000-0000-000000000000",
    } as any);
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ success: false, message: "Call not found" });
  });

  test("returns 200 when call has no contact_id", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({ update: async () => ({}) }),
    });
    mockCall({ contact_id: null });
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcDequeueContact).not.toHaveBeenCalled();
    expect(updateOutreachAttemptForWorkspace).not.toHaveBeenCalled();
  });

  test("outreach update error is thrown and returns 500", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    mockCall();
    vi.mocked(updateOutreachAttemptForWorkspace).mockRejectedValueOnce(new Error("outreach"));
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
  });
});

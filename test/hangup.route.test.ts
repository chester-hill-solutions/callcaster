import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    parseActionRequest: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));
vi.mock("../app/lib/database.server", () => ({
  parseActionRequest: (...args: any[]) => mocks.parseActionRequest(...args),
  createWorkspaceTwilioInstance: (...args: any[]) => mocks.createWorkspaceTwilioInstance(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

vi.mock("@/lib/campaign-queue-db.server", () => ({
  findActiveAssignedQueueForUser: vi.fn(),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallConferenceIdForWorkspace: vi.fn(),
  updateOutreachDispositionByContactId: vi.fn(),
}));

vi.mock("@/lib/db-rpc.server", () => ({
  rpcDequeueContact: vi.fn(),
}));

import { findActiveAssignedQueueForUser } from "@/lib/campaign-queue-db.server";
import { findCallConferenceIdForWorkspace, updateOutreachDispositionByContactId } from "@/lib/telephony-db.server";
import { rpcDequeueContact } from "@/lib/db-rpc.server";

function makeDbClient(options?: {
  queueError?: any;
  rpcError?: any;
  outreachError?: any;
  queueRows?: any[];
  callRecord?: { conference_id: string | null } | null;
}) {
  const realtimeSend = vi.fn();
  const removeChannel = vi.fn();
  const channelObj = { send: realtimeSend };

  const client: any = {
    realtime: { channel: (_id: string) => channelObj },
    removeChannel,
    from: (table: string) => {
      if (table === "call") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options?.callRecord ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          select: () => ({
            is: async () => ({
              data:
                options?.queueRows ??
                [
                  {
                    contact_id: 2,
                    status: "u1",
                    assigned_to_user_id: "u1",
                    dequeued_at: null,
                    campaign: { group_household_queue: true },
                  },
                ],
              error: options?.queueError ?? null,
            }),
          }),
        };
      }
      if (table === "outreach_attempt") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({
                data: [],
                error: options?.outreachError ?? null,
              }),
            }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
    rpc: async (_name: string, _args: any) => ({
      data: {},
      error: options?.rpcError ?? null,
    }),
  };

  return { client, realtimeSend, removeChannel };
}

describe("app/routes/api+/hangup/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseActionRequest.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
    vi.mocked(findActiveAssignedQueueForUser).mockReset();
    vi.mocked(findCallConferenceIdForWorkspace).mockReset();
    vi.mocked(updateOutreachDispositionByContactId).mockReset();
    vi.mocked(rpcDequeueContact).mockReset();
  });

  test("hangs up, dequeues, and updates outreach", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({
      conference_id: "conf",
      workspaceId: "w1",
      callSid: "CA1",
    });
    const callUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: (_sid: string) => ({ update: callUpdate }) });
    vi.mocked(findActiveAssignedQueueForUser).mockResolvedValueOnce({
      contact_id: 2,
      group_household_queue: true,
    });

    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcDequeueContact).toHaveBeenCalled();
    expect(updateOutreachDispositionByContactId).toHaveBeenCalledWith("w1", 2, "completed");
  });

  test("returns 200 when Twilio returns 21220 (call already ended)", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    const err21220 = new Error("Call is not in-progress. Cannot redirect.") as Error & { code: number };
    err21220.code = 21220;
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw err21220;
        },
      }),
    });
    vi.mocked(findActiveAssignedQueueForUser).mockResolvedValueOnce({
      contact_id: 2,
      group_household_queue: false,
    });
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(rpcDequeueContact).toHaveBeenCalled();
  });

  test("returns 500 when Twilio throws non-21220", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: () => ({
        update: async () => {
          throw new Error("Call is not in-progress");
        },
      }),
    });
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  test("returns 200 when no queue entry (handset mode)", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "conf", workspaceId: "w1", callSid: "CA1" });
    const callUpdate = vi.fn(async () => ({}));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: (_sid: string) => ({ update: callUpdate }) });
    vi.mocked(findActiveAssignedQueueForUser).mockResolvedValueOnce(null);
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  test("outreach update error is thrown and returns 500", async () => {
    queueJsonAuthSession({ user: { id: "u1" } });
    mocks.parseActionRequest.mockResolvedValueOnce({ conference_id: "c", workspaceId: "w1", callSid: "CA1" });
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: () => ({ update: async () => ({}) }) });
    vi.mocked(findActiveAssignedQueueForUser).mockResolvedValueOnce({
      contact_id: 2,
      group_household_queue: false,
    });
    vi.mocked(updateOutreachDispositionByContactId).mockRejectedValueOnce(new Error("outreach"));
    const mod = await import("../app/routes/api+/hangup");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res.status).toBe(500);
  });
});


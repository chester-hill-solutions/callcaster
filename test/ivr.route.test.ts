import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession, setDualAuthSession, queueJsonAuthSession, setJsonAuthSession, queueSudoAuth, setSudoAuth } from "./helpers/route-auth-mock";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    createWorkspaceTwilioInstance: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    verifyAuth: vi.fn(),
    env: {
      BETTER_AUTH_URL: () => "https://sb.example",
      BETTER_AUTH_SERVICE_KEY: () => "svc",
      BASE_URL: () => "https://base.example",
    },
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

vi.mock("@client/client-js", () => ({ createClient: (...a: any[]) => mocks.createClient(...a) }));
vi.mock("../app/lib/database.server", () => ({
  createWorkspaceTwilioInstance: (...a: any[]) => mocks.createWorkspaceTwilioInstance(...a),
  requireWorkspaceAccess: (...a: any[]) => mocks.requireWorkspaceAccess(...a),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/auth.server", () => ({
  verifyAuth: (...args: any[]) => mocks.verifyAuth(...args),
}));

function makeDbClient(opts?: {
  outreachError?: any;
  insertError?: any;
  dequeueError?: any;
}) {
  const client: any = {
    rpc: async () => ({ data: 99, error: opts?.outreachError ?? null }),
    from: (table: string) => {
      if (table === "call") {
        return {
          insert: () => ({
            select: async () => ({ data: [], error: opts?.insertError ?? null }),
          }),
        };
      }
      if (table === "campaign_queue") {
        return {
          update: () => ({
            eq: async () => ({ data: [], error: opts?.dequeueError ?? null }),
          }),
        };
      }
      throw new Error("unexpected table");
    },
  };
  return client;
}

describe("app/routes/api+/ivr/tsx.route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.createWorkspaceTwilioInstance.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.logger.error.mockReset();
    setJsonAuthSession({ user: { id: "u1" },
    });
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  });

  test("throws when required form data missing", async () => {
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    const mod = await import("../app/routes/api+/ivr");
    const fd = new FormData();
    fd.set("to_number", "+1");
    await expect(mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any)).rejects.toThrow(
      "Missing required form data",
    );
  });

  test("success creates outreach, places call, inserts call, dequeues, returns JSON", async () => {
    mocks.createClient.mockReturnValueOnce(makeDbClient());
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({
      calls: { create: async (_p: any) => ({ sid: "CA1" }) },
    });
    const mod = await import("../app/routes/api+/ivr");
    const fd = new FormData();
    fd.set("to_number", "+1555");
    fd.set("campaign_id", "1");
    fd.set("workspace_id", "w1");
    fd.set("contact_id", "2");
    fd.set("caller_id", "+1666");
    fd.set("queue_id", "3");
    fd.set("user_id", "u1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://x", { method: "POST", body: fd }),
    } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, callSid: "CA1" });
  });

  test("returns 500 on errors (rpc/call insert/dequeue), with unknown error formatting", async () => {
    mocks.createClient.mockReturnValueOnce(makeDbClient({ outreachError: new Error("rpc") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    const mod = await import("../app/routes/api+/ivr");
    const fd = new FormData();
    fd.set("to_number", "+1555");
    fd.set("campaign_id", "1");
    fd.set("workspace_id", "w1");
    fd.set("contact_id", "2");
    fd.set("caller_id", "+1666");
    fd.set("queue_id", "3");
    fd.set("user_id", "u1");
    let res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("rpc");

    mocks.createClient.mockReturnValueOnce(makeDbClient({ insertError: new Error("ins") }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(500);

    mocks.createClient.mockReturnValueOnce(makeDbClient({ dequeueError: "nope" }));
    mocks.createWorkspaceTwilioInstance.mockResolvedValueOnce({ calls: { create: async () => ({ sid: "CA1" }) } });
    res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: "Error processing IVR request",
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    });
    expect(mocks.logger.error).toHaveBeenCalled();
  });
});


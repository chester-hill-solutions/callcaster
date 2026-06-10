import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440000";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    verifyAuth: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    normalizePhoneNumber: vi.fn((p: string) => `+${p}`),
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
    fetch: vi.fn(),
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...a: any[]) => mocks.safeParseJson(...a),
  requireWorkspaceAccess: (...a: any[]) => mocks.requireWorkspaceAccess(...a),
}));
vi.mock("../app/lib/supabase.server", () => ({
  verifyAuth: (...a: any[]) => mocks.verifyAuth(...a),
}));
vi.mock("../app/lib/utils", () => ({
  normalizePhoneNumber: (...a: any[]) => mocks.normalizePhoneNumber(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

function makeSupabaseClient(rpcImpl: () => Promise<{ data: unknown; error: unknown }>) {
  return {
    from: (table: string) => {
      if (table !== "campaign") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 1 }, error: null }),
            }),
          }),
        }),
      };
    },
    rpc: rpcImpl,
  };
}

describe("app/routes/api+/initiate-ivr/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.verifyAuth.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.normalizePhoneNumber.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("throws when get_campaign_queue rpc errors", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabaseClient(async () => ({ data: null, error: new Error("rpc") })),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api+/initiate-ivr");
    await expect(mod.action({ request: new Request("http://x", { method: "POST" }) } as any)).rejects.toThrow("rpc");
  });

  test("returns creditsError when ivr endpoint reports creditsError", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabaseClient(async () => ({
        data: [{ id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" }],
        error: null,
      })),
      user: { id: "u1" },
    });
    mocks.fetch.mockResolvedValueOnce({
      json: async () => ({ creditsError: true }),
    } as any);
    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    expect(res).toMatchObject({ creditsError: true });
  });

  test("logs fetch error and continues (res null), returning queue data", async () => {
    const queue = [{ id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" }];
    mocks.safeParseJson.mockResolvedValueOnce({
      campaign_id: 1,
      user_id: { id: "u1" },
      workspace_id: WORKSPACE_ID,
    });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabaseClient(async () => ({ data: queue, error: null })),
      user: { id: "u1" },
    });
    mocks.fetch.mockRejectedValueOnce(new Error("net"));

    const mod = await import("../app/routes/api+/initiate-ivr");
    const res = await asRouteResponse(await mod.action({ request: new Request("http://x", { method: "POST" }) } as any));
    await expect(res.json()).resolves.toEqual(queue);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error initiating IVR call:", expect.any(Error));
  });
});

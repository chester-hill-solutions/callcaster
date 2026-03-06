import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    verifyAuth: vi.fn(),
    normalizePhoneNumber: vi.fn((p: string) => `+${p}`),
    logger: { debug: vi.fn(), error: vi.fn() },
    env: { BASE_URL: () => "https://base.example" },
    fetch: vi.fn(),
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...a: any[]) => mocks.safeParseJson(...a),
}));
vi.mock("../app/lib/supabase.server", () => ({
  verifyAuth: (...a: any[]) => mocks.verifyAuth(...a),
}));
vi.mock("../app/lib/utils", () => ({
  normalizePhoneNumber: (...a: any[]) => mocks.normalizePhoneNumber(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

describe("app/routes/api.initiate-ivr.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.verifyAuth.mockReset();
    mocks.normalizePhoneNumber.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  test("throws when get_campaign_queue rpc errors", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, user_id: { id: "u1" }, workspace_id: "w1" });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: { rpc: async () => ({ data: null, error: new Error("rpc") }) },
    });
    const mod = await import("../app/routes/api.initiate-ivr");
    await expect(mod.action({ request: new Request("http://x", { method: "POST" }) } as any)).rejects.toThrow("rpc");
  });

  test("returns creditsError when ivr endpoint reports creditsError", async () => {
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, user_id: { id: "u1" }, workspace_id: "w1" });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: { rpc: async () => ({ data: [{ id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" }], error: null }) },
    });
    mocks.fetch.mockResolvedValueOnce({
      json: async () => ({ creditsError: true }),
    } as any);
    const mod = await import("../app/routes/api.initiate-ivr");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res).toEqual({ creditsError: true });
  });

  test("logs fetch error and continues (res null), returning queue data", async () => {
    const queue = [{ id: "q1", contact_id: "c1", caller_id: "+1", phone: "555" }];
    mocks.safeParseJson.mockResolvedValueOnce({ campaign_id: 1, user_id: { id: "u1" }, workspace_id: "w1" });
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: { rpc: async () => ({ data: queue, error: null }) },
    });
    mocks.fetch.mockRejectedValueOnce(new Error("net"));

    const mod = await import("../app/routes/api.initiate-ivr");
    const res = await mod.action({ request: new Request("http://x", { method: "POST" }) } as any);
    expect(res).toEqual(queue);
    expect(mocks.logger.error).toHaveBeenCalledWith("Error initiating IVR call:", expect.any(Error));
  });
});


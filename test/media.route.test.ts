import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    verifyAuth: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  verifyAuth: (...a: any[]) => mocks.verifyAuth(...a),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeSupabase(opts?: { uploadError?: any; updateError?: any }) {
  return {
    storage: {
      from: () => ({
        upload: async (_name: string, _buf: any, _opts: any) => ({
          data: opts?.uploadError ? null : { path: "p1" },
          error: opts?.uploadError ?? null,
        }),
        getPublicUrl: (_path: string) => ({ data: { publicUrl: "https://public" } }),
      }),
    },
    from: (_t: string) => ({
      update: () => ({
        eq: async () => ({ data: [], error: opts?.updateError ?? null }),
      }),
    }),
  };
}

describe("app/routes/api.media.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.logger.error.mockReset();
  });

  test("uploads media and updates campaign, returning public url", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase(), user: { id: "u1" } });
    const mod = await import("../app/routing/api/api.media");
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    fd.set("live_campaign_id", "1");
    fd.set("campaign_name", "Camp");
    const res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toBe("https://public");
  });

  test("returns 500 on upload/update error", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ uploadError: new Error("up") }), user: { id: "u1" } });
    const mod = await import("../app/routing/api/api.media");
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    const res = await mod.action({ request: new Request("http://x", { method: "POST", body: fd }) } as any);
    expect(res.status).toBe(500);
    expect(mocks.logger.error).toHaveBeenCalled();

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ updateError: new Error("upd") }), user: { id: "u1" } });
    const fd2 = new FormData();
    fd2.set("file", new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    fd2.set("live_campaign_id", "1");
    const res2 = await mod.action({ request: new Request("http://x", { method: "POST", body: fd2 }) } as any);
    expect(res2.status).toBe(500);
  });
});


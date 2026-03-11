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

function makeSupabase(opts?: {
  uploadError?: any;
  signedUrlError?: any;
  campaignError?: any;
  updateError?: any;
  campaign?: any;
}) {
  const hasCampaignOverride = Boolean(opts && Object.prototype.hasOwnProperty.call(opts, "campaign"));
  const supabaseClient: any = {
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: opts?.uploadError ?? null }),
        createSignedUrl: async () => ({
          data: { signedUrl: "https://signed" },
          error: opts?.signedUrlError ?? null,
        }),
      }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: hasCampaignOverride ? opts!.campaign : { id: 1, message_media: ["a.png"] },
            error: opts?.campaignError ?? null,
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: async () => ({ data: [{ ok: 1 }], error: opts?.updateError ?? null }),
        }),
      }),
    }),
  };
  return supabaseClient;
}

function req(method: string, fd: FormData) {
  return new Request("http://x", { method, body: fd });
}

describe("app/routes/api.message_media.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyAuth.mockReset();
    mocks.logger.error.mockReset();
  });

  test("requires workspaceId", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase(), headers: new Headers({ "X": "1" }) });
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    const res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(res.headers.get("X")).toBe("1");
  });

  test("POST handles upload errors (non-409), 409 conflict continues", async () => {
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "a b@.png");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ uploadError: { statusCode: "500" } }), headers: new Headers() });
    let res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalled();

    // 409 conflict: upload error ignored, then no campaignId => signed url
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ uploadError: { statusCode: "409" } }), headers: new Headers() });
    res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: true, url: "https://signed" });
  });

  test("POST with campaignId updates message_campaign, covering errors and success", async () => {
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "x.png");
    fd.set("campaignId", "1");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaignError: new Error("c") }), headers: new Headers() });
    let res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ updateError: new Error("u") }), headers: new Headers() });
    res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaign: { id: 1, message_media: [] } }), headers: new Headers() });
    res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("POST without campaignId returns signed URL or error", async () => {
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "x.png");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ signedUrlError: new Error("s") }), headers: new Headers() });
    let res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase(), headers: new Headers() });
    res = await mod.action({ request: req("POST", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: true, url: "https://signed" });
  });

  test("DELETE updates message_campaign, covering errors and success", async () => {
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("fileName", "x.png");
    fd.set("campaignId", "1");

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaignError: new Error("c") }), headers: new Headers() });
    let res = await mod.action({ request: req("DELETE", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ updateError: new Error("u") }), headers: new Headers() });
    res = await mod.action({ request: req("DELETE", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: false });

    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaign: { id: 1, message_media: ["x.png", "y.png"] } }), headers: new Headers() });
    res = await mod.action({ request: req("DELETE", fd) } as any);
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("covers filename non-string branches and message_media nullish fallbacks", async () => {
    const mod = await import("../app/routes/api.message_media");

    // POST: fileName as File => String(mediaNameRaw ?? '')
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", new File(["x"], "name.txt"));
    fd.set("campaignId", "1");
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ campaign: null }),
      headers: new Headers(),
    });
    const r1 = await mod.action({ request: req("POST", fd) } as any);
    expect(r1.status).toBe(200);

    // DELETE: campaignId missing => null branch; fileName as File; campaign.message_media null => ?? [] fallback
    const fd2 = new FormData();
    fd2.set("workspaceId", "w1");
    fd2.set("fileName", new File(["x"], "name.txt"));
    mocks.verifyAuth.mockResolvedValueOnce({
      supabaseClient: makeSupabase({ campaign: { id: 1, message_media: null } }),
      headers: new Headers(),
    });
    const r2 = await mod.action({ request: req("DELETE", fd2) } as any);
    expect(r2.status).toBe(200);
  });

  test("covers fileName missing => mediaNameRaw ?? '' fallback for POST and DELETE", async () => {
    const mod = await import("../app/routes/api.message_media");

    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    // omit fileName
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaign: null }), headers: new Headers() });
    const r1 = await mod.action({ request: req("POST", fd) } as any);
    expect(r1.status).toBe(200);

    const fd2 = new FormData();
    fd2.set("workspaceId", "w1");
    // omit fileName and campaignId
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase({ campaign: { id: 1, message_media: [] } }), headers: new Headers() });
    const r2 = await mod.action({ request: req("DELETE", fd2) } as any);
    expect(r2.status).toBe(200);
  });

  test("returns 405 for unsupported method", async () => {
    mocks.verifyAuth.mockResolvedValueOnce({ supabaseClient: makeSupabase(), headers: new Headers() });
    const mod = await import("../app/routes/api.message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    const res = await mod.action({ request: req("PUT", fd) } as any);
    expect(res.status).toBe(405);
  });
});


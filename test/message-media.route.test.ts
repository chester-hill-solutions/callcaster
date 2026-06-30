import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
const postgresServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn() , info: vi.fn(), debug: vi.fn()},
  };
});

const campaignMocks = vi.hoisted(() => ({
  findCampaignMessageMedia: vi.fn(),
  updateCampaignMessageMedia: vi.fn(),
}));

vi.mock("@/lib/campaign-ivr.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campaign-ivr.server")>();
  return {
    ...actual,
    findCampaignMessageMedia: (...args: unknown[]) =>
      campaignMocks.findCampaignMessageMedia(...args),
    updateCampaignMessageMedia: (...args: unknown[]) =>
      campaignMocks.updateCampaignMessageMedia(...args),
  };
});

vi.mock("../app/lib/adminDb.server", () => ({
  getSession: () => ({ headers: postgresServerMocks.headers,
  }),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));

function makeDbClient(opts?: {
  uploadError?: any;
  signedUrlError?: any;
  campaignError?: any;
  updateError?: any;
  campaign?: any;
}) {
  const hasCampaignOverride = Boolean(opts && Object.prototype.hasOwnProperty.call(opts, "campaign"));
  campaignMocks.findCampaignMessageMedia.mockImplementation(async () => {
    if (opts?.campaignError) {
      throw opts.campaignError;
    }
    if (hasCampaignOverride && opts?.campaign == null) {
      return null;
    }
    return opts?.campaign ?? { id: 1, message_media: ["a.png"] };
  });
  campaignMocks.updateCampaignMessageMedia.mockImplementation(async () => {
    if (opts?.updateError) {
      throw opts.updateError;
    }
    return { ok: 1 };
  });

  const mockClient: any = {
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: opts?.uploadError ?? null }),
        createSignedUrl: async () => ({
          data: { signedUrl: "https://signed" },
          error: opts?.signedUrlError ?? null,
        }),
      }),
    },
  };
  return null;
}

function req(method: string, fd: FormData) {
  return new Request("http://x", { method, body: fd });
}

describe("app/routes/api+/message_media/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.logger.error.mockReset();
    campaignMocks.findCampaignMessageMedia.mockReset();
    campaignMocks.updateCampaignMessageMedia.mockReset();
  });

  test("requires workspaceId", async () => {
    postgresServerMocks.headers = new Headers({ "X": "1" });
    queueDualAuthSession({ null: makeDbClient(), headers: new Headers({ "X": "1" }) });
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(res.headers.get("X")).toBe("1");
  });

  test("POST handles upload errors (non-409), 409 conflict continues", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "a b@.png");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ uploadError: { statusCode: "500" } }), headers: new Headers() });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalled();

    // 409 conflict: upload error ignored, then no campaignId => signed url
    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ uploadError: { statusCode: "409" } }), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true, url: "https://signed" });
  });

  test("POST with campaignId updates message_campaign, covering errors and success", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "x.png");
    fd.set("campaignId", "1");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ campaignError: new Error("c") }), headers: new Headers() });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ updateError: new Error("u") }), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    queueDualAuthSession({ null: makeDbClient({ campaign: { id: 1, message_media: [] } }), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("POST without campaignId returns signed URL or error", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "x.png");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ signedUrlError: new Error("s") }), headers: new Headers() });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient(), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true, url: "https://signed" });
  });

  test("DELETE updates message_campaign, covering errors and success", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("fileName", "x.png");
    fd.set("campaignId", "1");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ campaignError: new Error("c") }), headers: new Headers() });
    let res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ updateError: new Error("u") }), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    queueDualAuthSession({ null: makeDbClient({ campaign: { id: 1, message_media: ["x.png", "y.png"] } }), headers: new Headers() });
    res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  test("covers filename non-string branches and message_media nullish fallbacks", async () => {
    const mod = await import("../app/routes/api+/message_media");

    // POST: fileName as File => String(mediaNameRaw ?? '')
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", new File(["x"], "name.txt"));
    fd.set("campaignId", "1");
    queueDualAuthSession({
      null: makeDbClient({ campaign: null }),
      headers: new Headers(),
    });
    const r1 = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(r1.status).toBe(200);

    // DELETE: campaignId missing => null branch; fileName as File; campaign.message_media null => ?? [] fallback
    const fd2 = new FormData();
    fd2.set("workspaceId", "w1");
    fd2.set("fileName", new File(["x"], "name.txt"));
    queueDualAuthSession({
      null: makeDbClient({ campaign: { id: 1, message_media: null } }),
      headers: new Headers(),
    });
    const r2 = await asRouteResponse(await mod.action({ request: req("DELETE", fd2) } as any));
    expect(r2.status).toBe(200);
  });

  test("covers fileName missing => mediaNameRaw ?? '' fallback for POST and DELETE", async () => {
    const mod = await import("../app/routes/api+/message_media");

    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    // omit fileName
    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient({ campaign: null }), headers: new Headers() });
    const r1 = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(r1.status).toBe(200);

    const fd2 = new FormData();
    fd2.set("workspaceId", "w1");
    // omit fileName and campaignId
    queueDualAuthSession({ null: makeDbClient({ campaign: { id: 1, message_media: [] } }), headers: new Headers() });
    const r2 = await asRouteResponse(await mod.action({ request: req("DELETE", fd2) } as any));
    expect(r2.status).toBe(200);
  });

  test("returns 405 for unsupported method", async () => {
    postgresServerMocks.headers = new Headers();
    queueDualAuthSession({ null: makeDbClient(), headers: new Headers() });
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    const res = await asRouteResponse(await mod.action({ request: req("PUT", fd) } as any));
    expect(res.status).toBe(405);
  });
});


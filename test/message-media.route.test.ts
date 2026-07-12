import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
});

import { asRouteResponse } from "./helpers/route-result";
import { queueDualAuthSession } from "./helpers/route-auth-mock";
import { uploadObject, createSignedObjectUrl, deleteObject } from "@/lib/object-storage.server";

const postgresServerMocks = vi.hoisted(() => ({ headers: new Headers() }));
const mocks = vi.hoisted(() => {
  return {
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    requireWorkspaceAccess: vi.fn(),
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

vi.mock("@/lib/auth.server", () => ({
  getSession: () => ({ headers: postgresServerMocks.headers }),
  requireDualAuth: vi.fn(),
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/object-storage.server", () => ({
  uploadObject: vi.fn(),
  createSignedObjectUrl: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("@/lib/database/workspace.server", () => ({
  requireWorkspaceAccess: (...args: unknown[]) =>
    mocks.requireWorkspaceAccess(...args),
}));

function makeDbClient(opts?: {
  uploadError?: any;
  signedUrlError?: any;
  campaignError?: any;
  updateError?: any;
  campaign?: any;
}) {
  vi.mocked(uploadObject).mockImplementation(async () => {
    if (opts?.uploadError) {
      throw opts.uploadError;
    }
    return undefined;
  });
  vi.mocked(createSignedObjectUrl).mockImplementation(async () => {
    if (opts?.signedUrlError) {
      throw opts.signedUrlError;
    }
    return "https://signed";
  });
  vi.mocked(deleteObject).mockImplementation(async () => undefined);
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

  return {
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
}

function authSession() {
  return { user: { id: "u1" }, authType: "session" as const, headers: new Headers() };
}

function req(method: string, fd: FormData) {
  return new Request("http://x", { method, body: fd });
}

describe("app/routes/api+/message_media/route.tsx", () => {
  beforeEach(() => {
    mocks.logger.error.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.requireWorkspaceAccess.mockResolvedValue(undefined);
    campaignMocks.findCampaignMessageMedia.mockReset();
    campaignMocks.updateCampaignMessageMedia.mockReset();
    vi.mocked(uploadObject).mockReset();
    vi.mocked(createSignedObjectUrl).mockReset();
    vi.mocked(deleteObject).mockReset();
  });

  test("requires workspaceId", async () => {
    postgresServerMocks.headers = new Headers({ "X": "1" });
    queueDualAuthSession(authSession());
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(res.headers.get("X")).toBe("1");
  });

  test("requires workspace access", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "a.png");
    queueDualAuthSession(authSession());
    mocks.requireWorkspaceAccess.mockRejectedValueOnce(new Error("boom"));
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(res.status).toBe(500);
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({ user: { id: "u1" }, workspaceId: "w1" });
  });

  test("rejects invalid file types", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "malware.exe"));
    fd.set("fileName", "malware.exe");
    fd.set("campaignId", "1");
    queueDualAuthSession(authSession());
    makeDbClient({ campaign: { id: 1, message_media: [] } });
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: "Invalid file extension" });
    expect(vi.mocked(uploadObject)).not.toHaveBeenCalled();
  });

  test("rejects files larger than 10MB", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    fd.set("fileName", "big.png");
    queueDualAuthSession(authSession());
    makeDbClient();
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: "File exceeds 10MB limit" });
    expect(vi.mocked(uploadObject)).not.toHaveBeenCalled();
  });

  test("strips path traversal characters from filenames", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "../../../etc/passwd.png"));
    fd.set("fileName", "../../../etc/passwd.png");
    queueDualAuthSession(authSession());
    makeDbClient();
    const res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(vi.mocked(uploadObject)).toHaveBeenCalledWith(
      "messageMedia",
      "w1/etc_passwd.png",
      expect.any(File),
      expect.any(Object),
    );
  });

  test("POST handles upload errors (non-409), 409 conflict continues", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("image", new File(["x"], "a.png"));
    fd.set("fileName", "a b@.png");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient({ uploadError: { statusCode: "500" } });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });
    expect(mocks.logger.error).toHaveBeenCalled();

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient({ uploadError: { statusCode: "409" } });
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
    queueDualAuthSession(authSession());
    makeDbClient({ campaignError: new Error("c") });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient({ updateError: new Error("u") });
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    queueDualAuthSession(authSession());
    makeDbClient({ campaign: { id: 1, message_media: [] } });
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
    queueDualAuthSession(authSession());
    makeDbClient({ signedUrlError: new Error("s") });
    let res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient();
    res = await asRouteResponse(await mod.action({ request: req("POST", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true, url: "https://signed" });
  });

  test("DELETE removes filename and S3 object", async () => {
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    fd.set("fileName", "x.png");
    fd.set("campaignId", "1");

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient({ campaignError: new Error("c") });
    let res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient({ updateError: new Error("u") });
    res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: false });

    queueDualAuthSession(authSession());
    makeDbClient({ campaign: { id: 1, message_media: ["x.png", "y.png"] } });
    res = await asRouteResponse(await mod.action({ request: req("DELETE", fd) } as any));
    await expect(res.json()).resolves.toMatchObject({ success: true });
    expect(vi.mocked(deleteObject)).toHaveBeenCalledWith("messageMedia", "w1/x.png");
  });

  test("returns 405 for unsupported method", async () => {
    postgresServerMocks.headers = new Headers();
    queueDualAuthSession(authSession());
    makeDbClient();
    const mod = await import("../app/routes/api+/message_media");
    const fd = new FormData();
    fd.set("workspaceId", "w1");
    const res = await asRouteResponse(await mod.action({ request: req("PUT", fd) } as any));
    expect(res.status).toBe(405);
  });
});

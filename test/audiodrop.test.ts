import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

import { asRouteResponse } from "./helpers/route-result";
import { setJsonAuthSession } from "./helpers/route-auth-mock";
import { logger } from "@/lib/logger.server";

const telephonyMocks = vi.hoisted(() => ({
  findCallSidByParentCallSid: vi.fn(),
  loadCampaignVoicedropAudio: vi.fn(),
}));

vi.mock("@/lib/telephony-db.server", () => ({
  findCallSidByParentCallSid: (...args: unknown[]) =>
    telephonyMocks.findCallSidByParentCallSid(...args),
}));

vi.mock("@/lib/sms-campaign-db.server", () => ({
  loadCampaignVoicedropAudio: (...args: unknown[]) =>
    telephonyMocks.loadCampaignVoicedropAudio(...args),
}));

vi.mock("@/lib/database.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database.server")>();
  return {
    ...actual,
    createWorkspaceTwilioInstance: vi.fn(),
  };
});

describe("api.audiodrop action", () => {
  beforeEach(() => {
    (logger.error as any).mockClear?.();
    telephonyMocks.findCallSidByParentCallSid.mockReset();
    telephonyMocks.loadCampaignVoicedropAudio.mockReset();
  });

  test("returns failure when call lookup errors", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    telephonyMocks.findCallSidByParentCallSid.mockResolvedValueOnce(null);

    const mockClient: any = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };
    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: { call: expect.any(Error) } });
  });

  test("returns failure when campaign lookup errors", async () => {
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update: vi.fn() }) }));

    telephonyMocks.findCallSidByParentCallSid.mockResolvedValueOnce("CA1");
    telephonyMocks.loadCampaignVoicedropAudio.mockRejectedValueOnce(new Error("campaign"));

    const mockClient: any = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: { campaign: expect.any(Error) } });
  });

  test("handles missing audio by completing call", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    telephonyMocks.findCallSidByParentCallSid.mockResolvedValueOnce("CA1");
    telephonyMocks.loadCampaignVoicedropAudio.mockResolvedValueOnce(null);

    const mockClient: any = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: "No audio found" });
    expect(update).toHaveBeenCalledWith({ status: "completed" });
  });

  test("handles voicemail signed url error, no signed url, and success", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    telephonyMocks.findCallSidByParentCallSid.mockResolvedValue("CA1");
    telephonyMocks.loadCampaignVoicedropAudio.mockResolvedValue("a.mp3");

    const createSignedUrl = vi.fn();
    const mockClient: any = {
      storage: { from: () => ({ createSignedUrl }) },
    };

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const makeReq = () => new Request("http://localhost/api/audiodrop", { method: "POST", body: fd });

    createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("vm") });
    const r1 = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(r1).toMatchObject({ success: false, error: "No audio found" });
    expect(update).toHaveBeenCalledWith({ status: "completed" });

    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "" }, error: null });
    const r2 = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(r2).toMatchObject({ success: false, error: "No signed URL found" });

    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://s" },
      error: new Error("vm"),
    });
    const r2b = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(r2b).toMatchObject({ success: false, error: { voicemail: expect.any(Error) } });

    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://s" }, error: null });
    const r3 = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ null })), createWorkspaceTwilioInstance },
    } as any));
    expect(r3).toMatchObject({ success: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ twiml: expect.stringContaining("<Play>https://s</Play>") }),
    );
  });

  test("uses default deps object when deps omitted", async () => {
    vi.resetModules();

    const update = vi.fn();
    const mockClient: any = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s" }, error: null }) }) },
    };

    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    telephonyMocks.findCallSidByParentCallSid.mockResolvedValue("CA1");
    telephonyMocks.loadCampaignVoicedropAudio.mockResolvedValue("a.mp3");

    setJsonAuthSession({ user: { id: "u1" } });
    vi.doMock("@/lib/database.server", () => ({ createWorkspaceTwilioInstance }));

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
    } as any));
    expect(res).toMatchObject({ success: true });
    expect(createWorkspaceTwilioInstance).toHaveBeenCalled();
  });
});

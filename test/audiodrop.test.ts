import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";
import { setJsonAuthSession } from "./helpers/route-auth-mock";
import { logger } from "@/lib/logger.server";

describe("api.audiodrop action", () => {
  beforeEach(() => {
    (logger.error as any).mockClear?.();
  });

  test("returns failure when call lookup errors", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: new Error("call") }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };
    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: { call: expect.any(Error) } });
  });

  test("returns failure when campaign lookup errors", async () => {
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update: vi.fn() }) }));

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { sid: "CA1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "live_campaign") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: new Error("campaign") }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: { campaign: expect.any(Error) } });
  });

  test("handles missing audio by completing call", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { sid: "CA1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "live_campaign") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { voicedrop_audio: null }, error: null }),
              }),
            }),
          };
        }
        throw new Error("unexpected");
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    };

    const mod = await import("../app/routes/api+/audiodrop");
    const fd = new FormData();
    fd.set("callId", "c1");
    fd.set("workspaceId", "w1");
    fd.set("campaignId", "1");
    const res = await asRouteResponse(await mod.action({
      request: new Request("http://localhost/api/audiodrop", { method: "POST", body: fd }),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(res).toMatchObject({ success: false, error: "No audio found" });
    expect(update).toHaveBeenCalledWith({ status: "completed" });
  });

  test("handles voicemail signed url error, no signed url, and success", async () => {
    const update = vi.fn();
    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    const createSignedUrl = vi.fn();
    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { sid: "CA1" }, error: null }) }) }) };
        }
        if (table === "live_campaign") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicedrop_audio: "a.mp3" }, error: null }) }) }) };
        }
        throw new Error("unexpected");
      },
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
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    // Current implementation checks `audio` before `voicemailError`.
    expect(r1).toMatchObject({ success: false, error: "No audio found" });
    expect(update).toHaveBeenCalledWith({ status: "completed" });

    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "" }, error: null });
    const r2 = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(r2).toMatchObject({ success: false, error: "No signed URL found" });

    // Covers `if (voicemailError) throw { voicemail: voicemailError }`
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://s" },
      error: new Error("vm"),
    });
    const r2b = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(r2b).toMatchObject({ success: false, error: { voicemail: expect.any(Error) } });

    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://s" }, error: null });
    const r3 = await asRouteResponse(await mod.action({
      request: makeReq(),
      deps: { verifyAuth: vi.fn(async () => ({ supabaseClient })), createWorkspaceTwilioInstance },
    } as any));
    expect(r3).toMatchObject({ success: true });
    expect(update).toHaveBeenCalledWith({ twiml: `<Response><Play>https://s</Play></Response>` });
  });

  test("uses default deps object when deps omitted", async () => {
    vi.resetModules();

    const update = vi.fn();
    const supabaseClient: any = {
      from: (table: string) => {
        if (table === "call") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { sid: "CA1" }, error: null }) }) }) };
        }
        if (table === "live_campaign") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { voicedrop_audio: "a.mp3" }, error: null }) }) }) };
        }
        throw new Error("unexpected");
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s" }, error: null }) }) },
    };

    const createWorkspaceTwilioInstance = vi.fn(async () => ({ calls: () => ({ update }) }));

    setJsonAuthSession({ supabaseClient, user: { id: "u1" } });
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


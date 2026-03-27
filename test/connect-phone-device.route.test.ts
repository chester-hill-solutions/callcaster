import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    safeParseJson: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    requireWorkspaceAccess: vi.fn(),
    twilioCreate: vi.fn(),
    logger: { error: vi.fn() },
    env: {
      TWILIO_PHONE_NUMBER: () => "+15550000000",
      BASE_URL: () => "https://base.example",
    },
  };
});

vi.mock("@/lib/database.server", () => ({
  safeParseJson: (...args: any[]) => mocks.safeParseJson(...args),
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/lib/supabase.server", () => ({
  createSupabaseServerClient: (...args: any[]) => mocks.createSupabaseServerClient(...args),
}));
vi.mock("@/twilio.server", () => ({
  twilio: { calls: { create: (...args: any[]) => mocks.twilioCreate(...args) } },
}));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));

describe("app/routes/api.connect-phone-device.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeParseJson.mockReset();
    mocks.createSupabaseServerClient.mockReset();
    mocks.requireWorkspaceAccess.mockReset();
    mocks.twilioCreate.mockReset();
    mocks.logger.error.mockReset();
  });

  test("returns 401 when no user", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      supabaseClient: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } },
      headers: new Headers({ "X-Test": "1" }),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+1555",
      workspaceId: "w1",
      campaignId: "c1",
    });

    const mod = await import("../app/routing/api/api.connect-phone-device");
    const res = await mod.action({
      request: new Request("http://localhost/api/connect-phone-device", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    } as any);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("creates call and returns callSid with headers", async () => {
    const headers = new Headers({ "Set-Cookie": "a=1" });
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      supabaseClient: { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } },
      headers,
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "c1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.twilioCreate.mockResolvedValueOnce({ sid: "CA1" });

    const mod = await import("../app/routing/api/api.connect-phone-device");
    const res = await mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBe("a=1");
    await expect(res.json()).resolves.toEqual({ success: true, callSid: "CA1" });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith({
      supabaseClient: expect.anything(),
      user: { id: "u1" },
      workspaceId: "w1",
    });
    expect(mocks.twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15551112222",
        from: "+15550000000",
        url: "https://base.example/api/connect-campaign-conference/w1/c1",
        method: "GET",
      }),
    );
  });

  test("returns 500 when Twilio call create throws", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      supabaseClient: { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } },
      headers: new Headers(),
    });
    mocks.safeParseJson.mockResolvedValueOnce({
      phoneNumber: "+15551112222",
      workspaceId: "w1",
      campaignId: "c1",
    });
    mocks.requireWorkspaceAccess.mockResolvedValueOnce(undefined);
    mocks.twilioCreate.mockRejectedValueOnce(new Error("twilio"));

    const mod = await import("../app/routing/api/api.connect-phone-device");
    const res = await mod.action({
      request: new Request("http://localhost/api/connect-phone-device", { method: "POST" }),
    } as any);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "twilio" });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "Error connecting phone device:",
      expect.any(Error),
    );
  });
});


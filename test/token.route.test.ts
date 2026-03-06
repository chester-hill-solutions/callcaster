import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const addGrant = vi.fn();
  const toJwt = vi.fn(() => "jwt-token");

  const AccessToken = vi.fn(function (this: any) {
    return {
      addGrant,
      toJwt,
    };
  }) as any;

  AccessToken.VoiceGrant = vi.fn(function (this: any) {
    return {};
  });

  return {
    getSupabaseServerClientWithSession: vi.fn(),
    env: { TWILIO_APP_SID: vi.fn(() => "AP123") },
    logger: { debug: vi.fn() },
    addGrant,
    toJwt,
    AccessToken,
  };
});

vi.mock("../app/lib/supabase.server", () => ({
  getSupabaseServerClientWithSession: (...args: any[]) =>
    mocks.getSupabaseServerClientWithSession(...args),
}));
vi.mock("@/lib/env.server", () => ({ env: mocks.env }));
vi.mock("@/lib/logger.server", () => ({ logger: mocks.logger }));
vi.mock("twilio", () => ({
  default: {
    jwt: {
      AccessToken: mocks.AccessToken,
    },
  },
}));

function makeSupabaseRowLookup(result: { data: any; error: any }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => result),
        })),
      })),
    })),
  };
}

describe("app/routes/api.token.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSupabaseServerClientWithSession.mockReset();
    mocks.env.TWILIO_APP_SID.mockClear();
    mocks.logger.debug.mockReset();
    mocks.AccessToken.mockClear();
    mocks.AccessToken.VoiceGrant.mockClear();
    mocks.addGrant.mockReset();
    mocks.toJwt.mockReset();
    mocks.toJwt.mockReturnValue("jwt-token");
  });

  test("loader returns 404 when workspace missing", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({ data: null, error: { message: "nope" } }),
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token?id=u1&workspace=w1"),
    } as any);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "workspace not found" });
  });

  test("loader generates token and logs debug; covers ?? defaults", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: { sid: "AC1" }, key: "K", token: "S" },
        error: null,
      }),
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token"), // id/workspace default to ''
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "jwt-token" });
    expect(mocks.AccessToken.VoiceGrant).toHaveBeenCalledWith({
      outgoingApplicationSid: "AP123",
      incomingAllow: true,
    });
    expect(mocks.AccessToken).toHaveBeenCalledWith("AC1", "K", "S", { identity: "" });
    expect(mocks.addGrant).toHaveBeenCalled();
    expect(mocks.logger.debug).toHaveBeenCalledWith("Generated Twilio token");
  });

  test("loader handles non-string sid and null key/token", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: { sid: 123 }, key: null, token: undefined },
        error: null,
      }),
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token?id=me&workspace=w1"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "jwt-token" });
    expect(mocks.AccessToken).toHaveBeenCalledWith("", "", "", { identity: "me" });
  });

  test("loader handles null twilio_data via ?? {}", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: null, key: "K", token: "S" },
        error: null,
      }),
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token?workspace=w1&id=me"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "jwt-token" });
    expect(mocks.AccessToken).toHaveBeenCalledWith("", "K", "S", { identity: "me" });
  });

  test("generateToken returns jwt", async () => {
    const mod = await import("../app/routes/api.token");
    const jwt = mod.generateToken({
      twilioAccountSid: "AC2",
      twilioApiKey: "K2",
      twilioApiSecret: "S2",
      identity: "ident",
    });
    expect(jwt).toBe("jwt-token");
    expect(mocks.AccessToken).toHaveBeenCalledWith("AC2", "K2", "S2", { identity: "ident" });
  });
});


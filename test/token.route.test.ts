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
    requireWorkspaceAccess: vi.fn(),
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
vi.mock("@/lib/database.server", () => ({
  requireWorkspaceAccess: (...args: any[]) => mocks.requireWorkspaceAccess(...args),
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
    mocks.requireWorkspaceAccess.mockReset();
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
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token?id=u1&workspace=w1"),
    } as any);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "workspace not found" });
  });

  test("loader rejects missing workspace", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: { sid: "AC1" }, key: "K", token: "S" },
        error: null,
      }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token"),
    } as any);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "workspace is required" });
  });

  test("loader generates token with authenticated user identity and logs debug", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: { sid: "AC1" }, key: "K", token: "S" },
        error: null,
      }),
      user: { id: "u1" },
    });
    const mod = await import("../app/routes/api.token");
    const res = await mod.loader({
      request: new Request("http://localhost/api/token?id=other-user&workspace=w1"),
    } as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: "jwt-token" });
    expect(mocks.AccessToken.VoiceGrant).toHaveBeenCalledWith({
      outgoingApplicationSid: "AP123",
      incomingAllow: true,
    });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", user: { id: "u1" } }),
    );
    expect(mocks.AccessToken).toHaveBeenCalledWith("AC1", "K", "S", { identity: "u1" });
    expect(mocks.addGrant).toHaveBeenCalled();
    expect(mocks.logger.debug).toHaveBeenCalledWith("Generated Twilio token");
  });

  test("loader handles non-string sid and null key/token", async () => {
    mocks.getSupabaseServerClientWithSession.mockResolvedValueOnce({
      supabaseClient: makeSupabaseRowLookup({
        data: { twilio_data: { sid: 123 }, key: null, token: undefined },
        error: null,
      }),
      user: { id: "me" },
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
      user: { id: "me" },
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


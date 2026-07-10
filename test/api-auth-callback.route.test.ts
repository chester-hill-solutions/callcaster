import { describe, expect, test, vi, beforeEach } from "vitest";

import { asRouteResponse, withRouteUrl } from "./helpers/route-result";

const authApiMocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: { api: authApiMocks },
}));

vi.mock("@/lib/better-auth-headers.server", () => ({
  mergeBetterAuthSetCookieHeaders: vi.fn((headers) => headers ?? new Headers()),
}));

vi.mock("@/lib/env.server", () => ({
  env: {
    BETTER_AUTH_URL: () => "http://adminDb.test",
    BETTER_AUTH_ANON_KEY: () => "anon-key",
  },
}));
vi.mock("@/lib/logger.server", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("app/routes/api+/auth/callback/route.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("redirects to next on successful OTP verification and appends Set-Cookie", async () => {
    authApiMocks.verifyEmail.mockResolvedValue({
      response: { user: { id: "u1" } },
      headers: new Headers([["Set-Cookie", "a=1"], ["Set-Cookie", "b="]]),
    });

    const mod = await import("../app/routes/api+/auth/callback.route");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=%2Fok",
      ),
    } as any)));

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/ok");
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("a=1");
    expect(setCookie).toContain("b=");
    expect(authApiMocks.verifyEmail).toHaveBeenCalledWith({
      query: { token: "th" },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
  }, 30000);

  test("redirects to auth-code-error on verifyOtp error and logs", async () => {
    authApiMocks.verifyEmail.mockRejectedValue(new Error("bad"));

    const { logger } = await import("@/lib/logger.server");
    const mod = await import("../app/routes/api+/auth/callback.route");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=%2Fok",
      ),
    } as any)));

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/auth/auth-code-error");
    expect(logger.error).toHaveBeenCalled();
  });

  test("falls back to root for absolute next URLs", async () => {
    authApiMocks.verifyEmail.mockResolvedValue({
      response: { user: { id: "u1" } },
      headers: new Headers(),
    });

    const mod = await import("../app/routes/api+/auth/callback.route");
    const res = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request(
        "http://localhost/api/auth/callback?token_hash=th&type=signup&next=https%3A%2F%2Fevil.example",
      ),
    } as any)));

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  test("redirects to auth-code-error when token_hash/type missing", async () => {
    vi.doMock("@client/ssr", () => ({
      createServerClient: vi.fn(() => ({ auth: { verifyOtp: vi.fn() } })),
      parse: vi.fn(() => ({})),
      serialize: vi.fn((k: string, v: string) => `${k}=${v}`),
    }));

    const mod = await import("../app/routes/api+/auth/callback.route");
    const res1 = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/auth/callback?type=signup"),
    } as any)));
    expect(res1.headers.get("Location")).toBe("/auth/auth-code-error");

    const res2 = await asRouteResponse(await mod.loader(withRouteUrl({
      request: new Request("http://localhost/api/auth/callback?token_hash=th"),
    } as any)));
    expect(res2.headers.get("Location")).toBe("/auth/auth-code-error");
  });
});


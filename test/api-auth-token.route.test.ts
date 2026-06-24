import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  tokenLogin: vi.fn(),
  enforceAuthRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/platform-auth.server", () => ({
  tokenLogin: (...args: unknown[]) => mocks.tokenLogin(...args),
}));

vi.mock("@/lib/platform-auth-rate-limit.server", () => ({
  enforceAuthRateLimit: (...args: unknown[]) => mocks.enforceAuthRateLimit(...args),
}));

describe("app/routes/api+/auth/token/route.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns tokens on successful login", async () => {
    mocks.tokenLogin.mockResolvedValueOnce({
      ok: true,
      data: {
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "u1", email: "a@b.com" },
      },
    });

    const mod = await import("../app/routes/api+/auth/token.route");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "a@b.com", password: "secret" }),
        }),
      } as never),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: "at",
      user: { id: "u1" },
    });
    expect(mocks.tokenLogin).toHaveBeenCalledOnce();
  });

  test("returns 401 when credentials are invalid", async () => {
    mocks.tokenLogin.mockResolvedValueOnce({
      ok: false,
      error: "Invalid credentials",
      status: 401,
    });

    const mod = await import("../app/routes/api+/auth/token.route");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "a@b.com", password: "bad" }),
        }),
      } as never),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid credentials",
    });
  });

  test("rejects non-POST methods", async () => {
    const mod = await import("../app/routes/api+/auth/token.route");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/api/auth/token", { method: "GET" }),
      } as never),
    );

    expect(response.status).toBe(405);
  });
});

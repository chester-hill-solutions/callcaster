import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  rateLimitedPostAuth: vi.fn(() => async () => null),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: { api: { resetPassword: mocks.resetPassword } },
}));
vi.mock("@/lib/platform-auth-rate-limit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-auth-rate-limit.server")>()),
  rateLimitedPostAuth: (...args: unknown[]) => mocks.rateLimitedPostAuth(...args),
}));

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("api+/auth/reset-password.action.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.resetPassword.mockReset();
  });

  test("resets with the body token and no session", async () => {
    mocks.resetPassword.mockResolvedValueOnce({ status: true });
    const mod = await import("../app/routes/api+/auth/reset-password.action.server");

    const res = await asRouteResponse(
      mod.action({
        request: post({ token: "tok_123", password: "newPassword123", confirm_password: "newPassword123" }),
        params: {},
        context: {},
      } as never),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      body: { newPassword: "newPassword123", token: "tok_123" },
      headers: expect.any(Headers),
    });
  });

  test("rejects a body without a token before touching Better Auth", async () => {
    const mod = await import("../app/routes/api+/auth/reset-password.action.server");

    const res = await asRouteResponse(
      mod.action({
        request: post({ password: "newPassword123", confirm_password: "newPassword123" }),
        params: {},
        context: {},
      } as never),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  test("surfaces a rejected token as a client error", async () => {
    mocks.resetPassword.mockRejectedValueOnce(new Error("INVALID_TOKEN"));
    const mod = await import("../app/routes/api+/auth/reset-password.action.server");

    const res = await asRouteResponse(
      mod.action({
        request: post({ token: "expired", password: "newPassword123", confirm_password: "newPassword123" }),
        params: {},
        context: {},
      } as never),
    );

    expect(res.status).toBe(400);
  });
});

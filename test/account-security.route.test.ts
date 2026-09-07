import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  verifyTOTP: vi.fn(),
  enableTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  enforceTwoFactorSetupRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/two-factor-rate-limit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor-rate-limit.server")>()),
  enforceTwoFactorSetupRateLimit: (...args: unknown[]) =>
    mocks.enforceTwoFactorSetupRateLimit(...args),
}));
vi.mock("@/server/auth-instance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth-instance")>()),
  auth: {
    api: {
      verifyTOTP: (...args: unknown[]) => mocks.verifyTOTP(...args),
      enableTwoFactor: (...args: unknown[]) => mocks.enableTwoFactor(...args),
      disableTwoFactor: (...args: unknown[]) => mocks.disableTwoFactor(...args),
    },
  },
}));

function post(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost/account/security", { method: "POST", body: form });
}

describe("account.security action", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyTOTP.mockReset();
    mocks.verifyAuth.mockResolvedValue({ headers: new Headers(), user: { id: "u1" } });
  });

  test("verify forwards the two-factor cookies Better Auth sets", async () => {
    const setCookie = new Headers();
    setCookie.append("Set-Cookie", "better-auth.two_factor=verified; Path=/; HttpOnly");
    mocks.verifyTOTP.mockResolvedValueOnce({ headers: setCookie, response: { status: true } });

    const mod = await import("../app/routes/account.security.loader.server");
    const res = await asRouteResponse(
      mod.action({ request: post({ intent: "verify", code: "123456" }), params: {}, context: {} } as never),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("better-auth.two_factor=verified");
    expect(mocks.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: "123456" }, returnHeaders: true }),
    );
  });

  test("verify with a next target redirects and still carries the cookies", async () => {
    const setCookie = new Headers();
    setCookie.append("Set-Cookie", "better-auth.two_factor=verified; Path=/; HttpOnly");
    mocks.verifyTOTP.mockResolvedValueOnce({ headers: setCookie });

    const mod = await import("../app/routes/account.security.loader.server");
    const res = await asRouteResponse(
      mod.action({
        request: post({ intent: "verify", code: "123456", next: "/workspaces/w1" }),
        params: {},
        context: {},
      } as never),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces/w1");
    expect(res.headers.get("Set-Cookie")).toContain("better-auth.two_factor=verified");
  });
});

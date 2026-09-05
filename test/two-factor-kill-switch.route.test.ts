import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse, routeArgs } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  verifyTOTP: vi.fn(),
  enableTwoFactor: vi.fn(),
  isTwoFactorEnabled: vi.fn(async () => true),
  userHasPrivilegedWorkspaceRole: vi.fn(async () => true),
}));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  verifyAuth: (...args: unknown[]) => mocks.verifyAuth(...args),
}));
vi.mock("@/lib/two-factor.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor.server")>()),
  isTwoFactorEnabled: (...args: unknown[]) => mocks.isTwoFactorEnabled(...args),
  userHasPrivilegedWorkspaceRole: (...args: unknown[]) =>
    mocks.userHasPrivilegedWorkspaceRole(...args),
}));
vi.mock("@/server/auth-instance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth-instance")>()),
  auth: {
    api: {
      verifyTOTP: (...args: unknown[]) => mocks.verifyTOTP(...args),
      enableTwoFactor: (...args: unknown[]) => mocks.enableTwoFactor(...args),
    },
  },
}));

describe("two-factor kill switch (TWO_FACTOR_ENABLED unset)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    vi.resetModules();
    saved = process.env.TWO_FACTOR_ENABLED;
    delete process.env.TWO_FACTOR_ENABLED;
    mocks.verifyTOTP.mockReset();
    mocks.enableTwoFactor.mockReset();
    mocks.verifyAuth.mockResolvedValue({ headers: new Headers(), user: { id: "u1" } });
    return () => {
      process.env.TWO_FACTOR_ENABLED = saved;
    };
  });

  test("/two-factor redirects away instead of asking for a code", async () => {
    const mod = await import("../app/routes/two-factor.loader.server");
    const res = await asRouteResponse(
      mod.loader(routeArgs(new Request("http://localhost/two-factor?next=%2Fworkspaces%2Fw1")) as never),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/workspaces");
  });

  test("account security reports two-factor unavailable, even for an enrolled privileged user", async () => {
    const mod = await import("../app/routes/account.security.loader.server");
    const res = await asRouteResponse(
      mod.loader(routeArgs(new Request("http://localhost/account/security")) as never),
    );
    await expect(res.json()).resolves.toMatchObject({ twoFactorAvailable: false, privileged: true });
  });

  test("account security refuses enrollment and verification", async () => {
    const mod = await import("../app/routes/account.security.loader.server");
    for (const intent of ["enable", "verify"]) {
      const form = new FormData();
      form.set("intent", intent);
      form.set("password", "pw");
      form.set("code", "123456");
      const res = await asRouteResponse(
        mod.action(routeArgs(new Request("http://localhost/account/security", { method: "POST", body: form })) as never),
      );
      expect(res.status).toBe(403);
    }
    expect(mocks.enableTwoFactor).not.toHaveBeenCalled();
    expect(mocks.verifyTOTP).not.toHaveBeenCalled();
  });
});

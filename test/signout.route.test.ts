import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  revokeSessionByToken: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  revokeSessionByToken: (...args: unknown[]) => mocks.revokeSessionByToken(...args),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("@/lib/env.server", () => ({
  env: new Proxy({}, { get: () => () => "test" }),
}));

describe("app/routes/api+/auth/signout.action.server.ts", () => {
  beforeEach(() => {
    // The node suite shares a module registry across files; re-import so
    // platform-auth.server binds to THIS file's auth.server mock.
    vi.resetModules();
  });

  test("a bearer sign-out revokes that session token, not only the cookie", async () => {
    mocks.revokeSessionByToken.mockClear();
    mocks.signOut.mockResolvedValueOnce({ headers: new Headers() });

    const mod = await import("../app/routes/api+/auth/signout.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/auth/signout", {
          method: "POST",
          headers: { Authorization: "Bearer sess_token_abc" },
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeSessionByToken).toHaveBeenCalledWith("sess_token_abc");
    expect(mocks.signOut).toHaveBeenCalled();
  });

  test("a cookie-only sign-out does not touch bearer revocation", async () => {
    mocks.revokeSessionByToken.mockClear();
    mocks.signOut.mockResolvedValueOnce({ headers: new Headers() });

    const mod = await import("../app/routes/api+/auth/signout.action.server");
    await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/auth/signout", { method: "POST" }),
      } as any),
    );

    expect(mocks.revokeSessionByToken).not.toHaveBeenCalled();
  });

  test("rejects non-POST methods", async () => {
    const mod = await import("../app/routes/api+/auth/signout.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/auth/signout", {
          method: "GET",
        }),
      } as any),
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "Method not allowed" });
  });

  test("returns cleared cookies from signOut", async () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "session=; Max-Age=0; Path=/");
    mocks.signOut.mockResolvedValueOnce({ headers });

    const mod = await import("../app/routes/api+/auth/signout.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/api/auth/signout", {
          method: "POST",
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(response.headers.get("Set-Cookie")).toBe(
      "session=; Max-Age=0; Path=/",
    );
  });
});

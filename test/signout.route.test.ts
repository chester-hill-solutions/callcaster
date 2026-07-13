import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
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

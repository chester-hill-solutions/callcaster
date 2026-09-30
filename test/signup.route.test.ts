import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(() => ({
    headers: new Headers(),
  })),
  registerUser: vi.fn(),
  isSignupOpen: vi.fn(() => true),
  mergeBetterAuthSetCookieHeaders: vi.fn(
    (authHeaders?: Headers, sessionHeaders?: Headers) => {
      const merged = new Headers(sessionHeaders);
      authHeaders?.forEach((value, key) => merged.append(key, value));
      return merged;
    },
  ),
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/env.server", () => ({
  isSignupOpen: mocks.isSignupOpen,
}));

vi.mock("@/lib/platform-auth.server", () => ({
  registerUser: mocks.registerUser,
}));

vi.mock("@/lib/better-auth-headers.server", () => ({
  mergeBetterAuthSetCookieHeaders: mocks.mergeBetterAuthSetCookieHeaders,
}));

describe("app/routes/signup/route.tsx", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetRateLimitsForTests();
    mocks.isSignupOpen.mockReturnValue(true);
    mocks.getSession.mockReturnValue({ headers: new Headers() });
    mocks.registerUser.mockReset();
  });

  test("redirects to /workspaces after successful form signup when open", async () => {
    mocks.registerUser.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "Set-Cookie": "session=abc" }),
      data: { user: { id: "u1" }, token: "t" },
    });

    const form = new FormData();
    form.set("email", "user@example.com");
    form.set("password", "secret123");

    const mod = await import("../app/routes/signup");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/signup", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces");
    expect(mocks.registerUser).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        email: "user@example.com",
        password: "secret123",
      }),
    );
  });

  test("returns 403 for form signup when registration is closed", async () => {
    mocks.isSignupOpen.mockReturnValue(false);

    const form = new FormData();
    form.set("email", "user@example.com");
    form.set("password", "secret123");

    const mod = await import("../app/routes/signup");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/signup", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Registration is closed.",
    });
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });

  // #2220: the HTML signup form created accounts with no limiter, while its
  // JSON twin and signin had one. `auth:register` is 10/minute.
  test("throttles the HTML signup form after the signup bucket is spent", async () => {
    mocks.registerUser.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      data: { user: { id: "u1" }, token: "t" },
    });

    const submit = async () => {
      const form = new FormData();
      form.set("email", "user@example.com");
      form.set("password", "secret123");
      const mod = await import("../app/routes/signup");
      return asRouteResponse(
        mod.action({
          request: new Request("http://localhost/signup", {
            method: "POST",
            body: form,
          }),
        } as any),
      );
    };

    for (let i = 0; i < 10; i++) {
      const ok = await submit();
      expect(ok.status).toBe(302);
    }

    const limited = await submit();
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "Too many sign-up attempts. Wait a minute and try again.",
    });
    // The limiter must stop provisioning, not just report.
    expect(mocks.registerUser).toHaveBeenCalledTimes(10);
  });

  // The JSON branch shares the route, so it must share the limiter too — and
  // report in the shape a JSON caller can parse.
  test("throttles the JSON signup branch and answers in JSON", async () => {
    mocks.registerUser.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      data: { user: { id: "u1" }, token: "t" },
    });

    const submit = async () => {
      const mod = await import("../app/routes/signup");
      return asRouteResponse(
        mod.action({
          request: new Request("http://localhost/signup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "user@example.com", password: "secret123" }),
          }),
        } as any),
      );
    };

    for (let i = 0; i < 10; i++) {
      expect((await submit()).status).toBe(201);
    }

    const limited = await submit();
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: "Too many sign-up attempts. Try again shortly.",
    });
    expect(mocks.registerUser).toHaveBeenCalledTimes(10);
  });
});

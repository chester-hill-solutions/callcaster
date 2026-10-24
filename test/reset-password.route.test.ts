import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetRateLimitsForTests } from "@/lib/platform-rate-limit.server";
import { asRouteResponse, routeArgs } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));

vi.mock("@/lib/logger.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logger.server")>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      resetPassword: mocks.resetPassword,
    },
  },
}));

describe("resetLinkProblem", () => {
  // Literal copy on purpose: the constants are the source under test, so
  // asserting against them would only prove the module equals itself.
  test("a refused token outranks a missing one", async () => {
    const { resetLinkProblem } = await import("../shared/auth-policy");
    expect(resetLinkProblem(null, "INVALID_TOKEN")).toBe(
      "This reset link is invalid or has expired. Request a new one from the sign-in page.",
    );
    expect(resetLinkProblem("tok", "INVALID_TOKEN")).toBe(
      "This reset link is invalid or has expired. Request a new one from the sign-in page.",
    );
  });

  test("a missing, empty or blank token is an incomplete link", async () => {
    const { resetLinkProblem } = await import("../shared/auth-policy");
    const incomplete =
      "This reset link is incomplete. Request a new link to continue.";
    expect(resetLinkProblem(null, null)).toBe(incomplete);
    expect(resetLinkProblem("", null)).toBe(incomplete);
    expect(resetLinkProblem("   ", null)).toBe(incomplete);
  });

  test("a present token whose error is not a refusal keeps the form", async () => {
    const { resetLinkProblem } = await import("../shared/auth-policy");
    expect(resetLinkProblem("tok", null)).toBeNull();
    expect(resetLinkProblem("tok", "SOMETHING_ELSE")).toBeNull();
  });
});

describe("app/routes/reset-password", () => {
  beforeEach(async () => {
    await resetRateLimitsForTests();
    mocks.resetPassword.mockReset();
  });

  test("loader returns token from query string", async () => {
    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.loader(routeArgs(new Request("http://localhost/reset-password?token=abc123"))),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: "abc123", error: null });
  });

  test("loader returns null token when missing", async () => {
    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.loader(routeArgs(new Request("http://localhost/reset-password"))),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: null, error: null });
  });

  // Better Auth's own callback redirects here with ?error=INVALID_TOKEN when the
  // token is expired or unknown; the form must not pretend the link is usable.
  test("loader surfaces the expired-link error from the query string", async () => {
    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.loader(routeArgs(new Request("http://localhost/reset-password?error=INVALID_TOKEN"))),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: null,
      error: "INVALID_TOKEN",
    });
  });

  test("action names the password rule when Better Auth rejects a short password", async () => {
    mocks.resetPassword.mockRejectedValueOnce({
      body: { code: "PASSWORD_TOO_SHORT", message: "Password too short" },
    });

    const form = new FormData();
    form.set("password", "short1");
    form.set("confirmPassword", "short1");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: null,
      error: { message: "Password must be at least 8 characters." },
    });
  });

  test("action still reports an unusable token as an invalid link", async () => {
    mocks.resetPassword.mockRejectedValueOnce({
      body: { code: "INVALID_TOKEN", message: "Invalid token" },
    });

    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirmPassword", "newPassword123");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: null,
      error: { message: expect.stringContaining("invalid or has expired") },
    });
  });

  test("action surfaces a rejected reset instead of claiming success", async () => {
    mocks.resetPassword.mockRejectedValueOnce(new Error("invalid token"));

    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirmPassword", "newPassword123");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: null,
      error: { message: expect.stringContaining("invalid or has expired") },
    });
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      body: { newPassword: "newPassword123", token: "abc123" },
      headers: expect.any(Headers),
    });
  });

  test("action forwards the password exactly as typed, spaces included", async () => {
    mocks.resetPassword.mockResolvedValueOnce({});

    const form = new FormData();
    form.set("password", " spaced secret ");
    form.set("confirmPassword", " spaced secret ");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      body: { newPassword: " spaced secret ", token: "abc123" },
      headers: expect.any(Headers),
    });
  });

  test("action rejects mismatched passwords", async () => {
    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirmPassword", "differentPassword");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: null,
      error: { message: "Passwords do not match" },
    });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  test("action accepts confirm_password field", async () => {
    mocks.resetPassword.mockResolvedValueOnce({});

    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirm_password", "newPassword123");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(mod.action(
        routeArgs(
          new Request("http://localhost/reset-password?token=abc123", {
            method: "POST",
            body: form,
          }),
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, error: null });
  });

  // #2220: the HTML reset form took a token with no limiter, while the JSON
  // twin had one. `auth:reset-password` is 10/minute.
  test("throttles reset attempts after the reset bucket is spent", async () => {
    mocks.resetPassword.mockResolvedValue({});

    const submit = async () => {
      const form = new FormData();
      form.set("password", "newPassword123");
      form.set("confirm_password", "newPassword123");
      const mod = await import("../app/routes/reset-password");
      return asRouteResponse(
        mod.action(
          routeArgs(
            new Request("http://localhost/reset-password?token=abc123", {
              method: "POST",
              body: form,
            }),
          ),
        ),
      );
    };

    for (let i = 0; i < 10; i++) {
      expect((await submit()).status).toBe(200);
    }

    const limited = await submit();
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      success: null,
      error: { message: "Too many attempts. Wait a minute and try again." },
    });
    // The limiter must stop the reset call, not just report.
    expect(mocks.resetPassword).toHaveBeenCalledTimes(10);
  });
});

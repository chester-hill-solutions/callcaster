import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

function routeArgs(request: Request, params: Record<string, string> = {}) {
  return { request, params, url: new URL(request.url) };
}

const mocks = vi.hoisted(() => ({
  resetPassword: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      resetPassword: mocks.resetPassword,
    },
  },
}));

describe("app/routes/reset-password", () => {
  test("loader returns token from query string", async () => {
    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(
      await mod.loader(routeArgs(new Request("http://localhost/reset-password?token=abc123"))),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: "abc123" });
  });

  test("loader returns null token when missing", async () => {
    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(
      await mod.loader(routeArgs(new Request("http://localhost/reset-password"))),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: null });
  });

  test("action returns success even when resetPassword fails", async () => {
    mocks.resetPassword.mockRejectedValueOnce(new Error("invalid token"));

    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirmPassword", "newPassword123");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(
      await mod.action(
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
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      body: { newPassword: "newPassword123", token: "abc123" },
      headers: expect.any(Headers),
    });
  });

  test("action rejects mismatched passwords", async () => {
    const form = new FormData();
    form.set("password", "newPassword123");
    form.set("confirmPassword", "differentPassword");

    const mod = await import("../app/routes/reset-password");
    const response = await asRouteResponse(
      await mod.action(
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
    const response = await asRouteResponse(
      await mod.action(
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
});

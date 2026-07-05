import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      requestPasswordReset: mocks.requestPasswordReset,
    },
  },
}));

describe("app/routes/remember.action.server.ts", () => {
  test("requires email", async () => {
    const mod = await import("../app/routes/remember");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/remember", {
          method: "POST",
          body: new FormData(),
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { message: "Email is required" },
    });
  });

  test("calls requestPasswordReset with callback redirect", async () => {
    mocks.requestPasswordReset.mockResolvedValueOnce({});

    const form = new FormData();
    form.set("email", "user@example.com");

    const mod = await import("../app/routes/remember");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/remember", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { success: true },
      error: null,
    });
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: "user@example.com",
        redirectTo: "http://localhost/api/auth/callback",
      },
      headers: expect.any(Headers),
    });
  });

  test("returns error message on failure", async () => {
    mocks.requestPasswordReset.mockRejectedValueOnce(new Error("send failed"));

    const form = new FormData();
    form.set("email", "user@example.com");

    const mod = await import("../app/routes/remember");
    const response = await asRouteResponse(
      await mod.action({
        request: new Request("http://localhost/remember", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: null,
      error: { message: "send failed" },
    });
  });
});

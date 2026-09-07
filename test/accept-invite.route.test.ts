import { describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  isSignupOpen: vi.fn(() => true),
  signUpEmail: vi.fn(),
  getInvitesByUserId: vi.fn(),
  getSession: vi.fn(),
  verifyAuth: vi.fn(),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      signUpEmail: mocks.signUpEmail,
    },
  },
}));

vi.mock("@/lib/auth.server", () => ({
  getSession: mocks.getSession,
  verifyAuth: mocks.verifyAuth,
}));

vi.mock("@/lib/database/workspace.server", () => ({
  acceptWorkspaceInvitations: vi.fn(async () => ({ errors: [] })),
  getInvitesByUserId: mocks.getInvitesByUserId,
}));

vi.mock("@/lib/env.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env.server")>()),
  isSignupOpen: () => mocks.isSignupOpen(),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("app/routes/accept-invite.action.server.ts", () => {
  beforeEach(() => {
    mocks.isSignupOpen.mockReturnValue(true);
    mocks.signUpEmail.mockClear();
    mocks.getSession.mockResolvedValue({
      session: null,
      user: null,
      headers: new Headers(),
    });
  });

  test("signs up new user via signUpEmail", async () => {
    mocks.signUpEmail.mockResolvedValueOnce({
      response: {
        user: { id: "u-new", email: "new@example.com", name: "First Last" },
      },
      headers: new Headers([["Set-Cookie", "session=abc; Path=/"]]),
    });
    mocks.getInvitesByUserId.mockResolvedValueOnce([
      { id: "i1", workspace_id: "w1" },
    ]);

    const form = new FormData();
    form.set("actionType", "updateUser");
    form.set("email", "new@example.com");
    form.set("password", "newPassword123");
    form.set("confirmPassword", "newPassword123");
    form.set("firstName", "First");
    form.set("lastName", "Last");

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/accept-invite", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "updated",
      invites: [{ id: "i1", workspace_id: "w1" }],
    });
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: "new@example.com",
        password: "newPassword123",
        name: "First Last",
      },
      headers: expect.any(Headers),
      returnHeaders: true,
    });
    expect(response.headers.get("Set-Cookie")).toBe("session=abc; Path=/");
  });

  test("refuses to create an account while signup is closed", async () => {
    mocks.isSignupOpen.mockReturnValue(false);

    const form = new FormData();
    form.set("actionType", "updateUser");
    form.set("email", "new@example.com");
    form.set("password", "newPassword123");
    form.set("confirmPassword", "newPassword123");
    form.set("firstName", "First");
    form.set("lastName", "Last");

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/accept-invite", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      status: "error",
      error: "Registration is closed.",
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  test("returns error when signUpEmail fails", async () => {
    mocks.signUpEmail.mockRejectedValueOnce(new Error("email taken"));

    const form = new FormData();
    form.set("actionType", "updateUser");
    form.set("email", "new@example.com");
    form.set("password", "newPassword123");
    form.set("firstName", "First");
    form.set("lastName", "Last");

    const mod = await import("../app/routes/accept-invite.action.server");
    const response = await asRouteResponse(mod.action({
        request: new Request("http://localhost/accept-invite", {
          method: "POST",
          body: form,
        }),
      } as any),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      // Better Auth messages are lowercase, which toUserMessage classifies as
      // internal — so the user sees the actionable fallback, not the raw
      // provider string. The raw message still reaches the logger.
      error:
        "Could not create your account. That email may already be registered — try signing in instead.",
    });
  });
});

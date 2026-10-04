import { APIError } from "better-auth/api";
import { asRouteResponse } from "./helpers/route-result";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  isSignupOpen: vi.fn(() => true),
  enforceAuthRateLimit: vi.fn(() => null),
  getUserById: vi.fn(),
  updateOwnUserProfile: vi.fn(),
}));

vi.mock("@/lib/env.server", () => ({
  env: new Proxy({}, { get: () => () => "test" }),
  isSignupOpen: mocks.isSignupOpen,
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: {
      updateUser: mocks.updateUser,
      changePassword: mocks.changePassword,
      signUpEmail: mocks.signUpEmail,
      signInEmail: mocks.signInEmail,
    },
  },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getUserById: mocks.getUserById,
  listUserWorkspaceMembershipsForProfile: vi.fn(async () => []),
  updateOwnUserProfile: mocks.updateOwnUserProfile,
}));

vi.mock("@/lib/database/workspace.server", () => ({
  acceptWorkspaceInvitations: vi.fn(async () => ({ errors: [] })),
  getInvitesByUserId: vi.fn(async () => []),
}));

vi.mock("@/lib/database/workspace-provisioning.server", () => ({
  createNewWorkspace: vi.fn(async () => ({ data: "w1", error: null })),
}));

vi.mock("@/lib/platform-auth-rate-limit.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-auth-rate-limit.server")>()),
  enforceAuthRateLimit: mocks.enforceAuthRateLimit,
}));

describe("platform-auth.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.updateUser.mockReset();
    mocks.changePassword.mockReset();
    mocks.signUpEmail.mockReset();
    mocks.signInEmail.mockReset();
    mocks.enforceAuthRateLimit.mockReturnValue(null);
    mocks.isSignupOpen.mockReturnValue(true);
    mocks.getUserById.mockReset();
    mocks.getUserById.mockResolvedValue({
      id: "u1",
      first_name: "First",
      last_name: "Last",
      username: "a@b.com",
    });
    mocks.updateOwnUserProfile.mockReset();
    mocks.updateOwnUserProfile.mockResolvedValue({ id: "u1" });
  });

  describe("registerUser", () => {
    test("returns 403 when signup is closed", async () => {
      mocks.isSignupOpen.mockReturnValue(false);
      const mod = await import("../app/lib/platform-auth.server");

      const result = await mod.registerUser(new Request("http://localhost"), {
        email: "a@b.com",
        password: "password123",
      });

      expect(result).toEqual({
        ok: false,
        error: "Registration is closed.",
        status: 403,
      });
      expect(mocks.signUpEmail).not.toHaveBeenCalled();
    });
  });

  describe("loginWithPassword", () => {
    test("surfaces a generic message, never a raw backend error", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      mocks.signInEmail.mockRejectedValue(
        new Error("Failed query: relation auth_user does not exist"),
      );

      const result = await mod.loginWithPassword(
        new Request("http://localhost/signin", { headers: new Headers() }),
        "nobody@example.test",
        "password123",
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("We couldn't sign you in. Try again shortly.");
      expect(result.error).not.toContain("relation");
      expect(result.error).not.toContain("Failed query");
    });

    test("an empty provider result has the same safe credentials message", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      mocks.signInEmail.mockResolvedValue({ user: undefined, token: undefined });

      const result = await mod.loginWithPassword(
        new Request("http://localhost/signin", { headers: new Headers() }),
        "nobody@example.test",
        "wrong-password",
      );

      expect(result).toEqual({ ok: false, error: "Invalid email or password." });
    });
  });

  describe("password login feedback", () => {
    test.each([
      { status: "UNAUTHORIZED", code: "INVALID_EMAIL_OR_PASSWORD", expected: "Invalid email or password." },
      { status: "FORBIDDEN", code: "EMAIL_NOT_VERIFIED", expected: "Verify your email before signing in." },
      { status: "TOO_MANY_REQUESTS", code: undefined, expected: "Too many sign-in attempts. Wait a minute and try again." },
      { status: "BAD_REQUEST", code: "UNKNOWN_PROVIDER_ERROR", expected: "We couldn't sign you in. Try again shortly." },
      { status: "INTERNAL_SERVER_ERROR", code: "INVALID_EMAIL_OR_PASSWORD", expected: "We couldn't sign you in. Try again shortly." },
    ] as const)("maps $status / $code for browser and token login without provider text", async ({ status, code, expected }) => {
      const failure = new APIError(status, { code, message: "private provider and database details" });
      mocks.signInEmail.mockRejectedValue(failure);
      const mod = await import("../app/lib/platform-auth.server");
      const request = new Request("http://localhost/api/auth/token");
      await expect(mod.tokenLogin(request, { email: "nobody@example.test", password: "wrong-password" }))
        .resolves.toEqual({ ok: false, error: expected, status: 401 });

      const signin = await import("../app/routes/signin.action.server");
      const response = await asRouteResponse(signin.action({
        request: new Request("http://localhost/signin", {
          method: "POST",
          body: new URLSearchParams({ email: "nobody@example.test", password: "wrong-password" }),
        }),
        url: new URL("http://localhost/signin"),
        params: {},
        context: {},
      } as never));
      await expect(response.json()).resolves.toEqual({ error: expected });
    });

    test("does not accept a provider code on an ordinary driver error", async () => {
      mocks.signInEmail.mockRejectedValue(Object.assign(new Error("private SQL details"), {
        statusCode: 401, body: { code: "INVALID_EMAIL_OR_PASSWORD" },
      }));
      const mod = await import("../app/lib/platform-auth.server");
      await expect(mod.loginWithPassword(new Request("http://localhost/signin"), "a@example.test", "wrong"))
        .resolves.toEqual({ ok: false, error: "We couldn't sign you in. Try again shortly." });
    });

    test("retains successful profile and session cookies", async () => {
      mocks.signInEmail.mockResolvedValue({
        response: { token: "session-token", user: { id: "u1", email: "a@example.test", name: "First Last" } },
        headers: new Headers({ "set-cookie": "better-auth.session_token=session-token; HttpOnly; Path=/" }),
      });
      const mod = await import("../app/lib/platform-auth.server");
      const result = await mod.loginWithPassword(new Request("http://localhost/signin"), "a@example.test", "correct");
      expect(result).toMatchObject({ ok: true, token: "session-token", user: { id: "u1", first_name: "First", last_name: "Last" } });
      expect(result.ok && result.headers.get("set-cookie")).toContain("better-auth.session_token=session-token");
    });
  });

  describe("updateMeProfile", () => {
    test("requires current_password when changing password", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      mocks.updateUser.mockResolvedValueOnce({
        response: { user: { id: "u1", email: "a@b.com", name: "First Last" } },
      });

      const result = await mod.updateMeProfile(
        new Request("http://localhost/api/me", { headers: new Headers() }),
        "u1",
        {
          email: "a@b.com",
          password: "newPassword123",
        } as any,
      );

      expect(result).toEqual({
        ok: false,
        error: "Current password is required",
        status: 400,
      });
      expect(mocks.updateUser).not.toHaveBeenCalled();
      expect(mocks.changePassword).not.toHaveBeenCalled();
    });

    test("rejects empty current_password", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      const result = await mod.updateMeProfile(
        new Request("http://localhost/api/me", { headers: new Headers() }),
        "u1",
        {
          password: "newPassword123",
          current_password: "   ",
        } as any,
      );

      expect(result).toEqual({
        ok: false,
        error: "Current password is required",
        status: 400,
      });
    });

    test("changes password with current_password", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      mocks.updateUser.mockResolvedValueOnce({
        response: { user: { id: "u1", email: "a@b.com", name: "First Last" } },
      });
      mocks.changePassword.mockResolvedValueOnce({});

      const result = await mod.updateMeProfile(
        new Request("http://localhost/api/me", { headers: new Headers() }),
        "u1",
        {
          password: "newPassword123",
          current_password: "oldPassword123",
        } as any,
      );

      expect(result.ok).toBe(true);
      expect(mocks.changePassword).toHaveBeenCalledWith({
        body: {
          newPassword: "newPassword123",
          currentPassword: "oldPassword123",
        },
        headers: expect.any(Headers),
      });
    });

    test("does not change password when omitted", async () => {
      const mod = await import("../app/lib/platform-auth.server");
      mocks.updateUser.mockResolvedValueOnce({
        response: { user: { id: "u1", email: "a@b.com", name: "First Last" } },
      });

      const result = await mod.updateMeProfile(
        new Request("http://localhost/api/me", { headers: new Headers() }),
        "u1",
        {
          first_name: "Updated",
        } as any,
      );

      expect(result.ok).toBe(true);
      expect(mocks.updateUser).toHaveBeenCalledWith({
        body: { name: "Updated Last" },
        headers: expect.any(Headers),
        returnHeaders: true,
      });
      expect(mocks.updateOwnUserProfile).toHaveBeenCalledWith({
        userId: "u1",
        first_name: "Updated",
        last_name: "Last",
        username: "a@b.com",
      });
      expect(mocks.changePassword).not.toHaveBeenCalled();
    });

    test("accepts Better Auth status-only update response", async () => {
      mocks.updateUser.mockResolvedValueOnce({ response: { status: true } });
      const mod = await import("../app/lib/platform-auth.server");

      const result = await mod.updateMeProfile(
        new Request("http://localhost/api/me", { headers: new Headers() }),
        "u1",
        { first_name: "Updated", last_name: "Name" } as any,
      );

      expect(result.ok).toBe(true);
      expect(mocks.updateOwnUserProfile).toHaveBeenCalledWith({
        userId: "u1",
        first_name: "Updated",
        last_name: "Name",
        username: "a@b.com",
      });
    });
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  signUpEmail: vi.fn(),
  isSignupOpen: vi.fn(() => true),
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

describe("platform-auth.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.updateUser.mockReset();
    mocks.changePassword.mockReset();
    mocks.signUpEmail.mockReset();
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
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";

import { asRouteResponse } from "./helpers/route-result";

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  isTwoFactorEnabled: vi.fn(),
  userHasPrivilegedWorkspaceRole: vi.fn(),
  updateMeProfile: vi.fn(),
  verifyAuth: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  verifyAuth: mocks.verifyAuth,
}));

vi.mock("@/lib/platform-auth.server", () => ({
  updateMeProfile: mocks.updateMeProfile,
}));

vi.mock("@/lib/workspace-members-db.server", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/two-factor.server", () => ({
  isTwoFactorEnabled: mocks.isTwoFactorEnabled,
  userHasPrivilegedWorkspaceRole: mocks.userHasPrivilegedWorkspaceRole,
}));

describe("account route", () => {
  beforeEach(() => {
    mocks.verifyAuth.mockReset();
    mocks.verifyAuth.mockResolvedValue({
      user: { id: "u1", email: "person@example.com", name: "First Last" },
      headers: new Headers(),
    });
    mocks.getUserById.mockReset();
    mocks.getUserById.mockResolvedValue({
      id: "u1",
      first_name: "First",
      last_name: "Last",
      username: "person@example.com",
    });
    mocks.isTwoFactorEnabled.mockResolvedValue(false);
    mocks.userHasPrivilegedWorkspaceRole.mockResolvedValue(false);
    mocks.updateMeProfile.mockReset();
  });

  test("loads the signed-in user's profile", async () => {
    const { loader } = await import("../app/routes/account.loader.server");
    const response = await asRouteResponse(
      loader({
        request: new Request("http://localhost/account"),
        params: {},
        context: {},
      }),
    );

    await expect(response.json()).resolves.toEqual({
      firstName: "First",
      lastName: "Last",
      email: "person@example.com",
      twoFactorEnabled: false,
      privileged: false,
      enrollRequired: false,
    });
  });

  test("updates the signed-in user's profile", async () => {
    mocks.updateMeProfile.mockResolvedValue({
      ok: true,
      data: {
        id: "u1",
        email: "person@example.com",
        first_name: "Updated",
        last_name: "Person",
      },
      headers: new Headers(),
    });
    const form = new FormData();
    form.set("first_name", "Updated");
    form.set("last_name", "Person");

    const { action } = await import("../app/routes/account.loader.server");
    const request = new Request("http://localhost/account", {
      method: "POST",
      body: form,
    });
    const response = await asRouteResponse(
      action({ request, params: {}, context: {} }),
    );

    expect(mocks.updateMeProfile).toHaveBeenCalledWith(request, "u1", {
      first_name: "Updated",
      last_name: "Person",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

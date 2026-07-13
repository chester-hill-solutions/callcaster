import { beforeEach, describe, expect, test, vi } from "vitest";
import { asRouteResponse } from "./helpers/route-result";
import { withWorkspaceRouteArgs, createRouteContextProvider } from "./helpers/route-context-mock";

const authMocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(async () => ({
    headers: new Headers(),
    user: { id: "u1" },
  })),
}));

const dbMocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  getUserRole: vi.fn(async () => ({ role: "member" })),
  getWorkspaceUsers: vi.fn(async () => ({ data: [] })),
  getWorkspacePhoneNumbers: vi.fn(async () => ({ data: [] })),
}));

const settingsPageMocks = vi.hoisted(() => ({
  getWorkspaceSettingsPageData: vi.fn(async () => ({
    workspace: { id: "w1", name: "Acme" },
    userRole: "member",
    users: [],
    phoneNumbers: [],
    pendingInvites: [],
    webhook: null,
    hasAccess: true,
  })),
}));

const utilsMocks = vi.hoisted(() => ({
  handleAddUser: vi.fn(async () => ({ data: "ok", error: null })),
  handleUpdateUser: vi.fn(async () => ({ data: "ok", error: null })),
  handleDeleteUser: vi.fn(async () => ({ data: "ok", error: null })),
  handleDeleteSelf: vi.fn(async () => new Response(null, { status: 302 })),
  handleTransferWorkspace: vi.fn(async () => ({ data: "ok", error: null })),
  handleDeleteWorkspace: vi.fn(async () => new Response(null, { status: 302 })),
  removeInvite: vi.fn(async () => ({ data: "ok", error: null })),
  handleUpdateWebhook: vi.fn(async () => ({ data: "ok", error: null })),
}));

const numbersMocks = vi.hoisted(() => ({
  getWorkspaceCredits: vi.fn(async () => 0),
  listObjects: vi.fn(async () => []),
}));

const tdbMocks = vi.hoisted(() => ({
  inbound_queue: { findMany: vi.fn(async () => []) },
  script: { findMany: vi.fn(async () => []) },
}));

vi.mock("@/lib/auth.server", () => ({ ...authMocks }));
vi.mock("@/lib/database/workspace.server", () => ({ ...dbMocks }));
vi.mock("@/lib/workspace-settings-db.server", () => ({
  ...settingsPageMocks,
}));
vi.mock("@/lib/workspace-settings/WorkspaceSettingUtils.server", () => ({
  ...utilsMocks,
}));
vi.mock("@/lib/workspace-members-db.server", () => ({
  ...numbersMocks,
}));
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: vi.fn(() => tdbMocks),
}));

function buildRequest(formData: FormData): Request {
  return new Request("http://localhost/workspaces/w1/settings", {
    method: "POST",
    body: formData,
  });
}

function resetAll() {
  authMocks.verifyAuth.mockClear();
  dbMocks.requireWorkspaceAccess.mockClear();
  dbMocks.getUserRole.mockClear();
  Object.values(utilsMocks).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear());
  numbersMocks.getWorkspaceCredits.mockClear();
  numbersMocks.listObjects.mockClear();
  tdbMocks.inbound_queue.findMany.mockClear();
  tdbMocks.script.findMany.mockClear();

  authMocks.verifyAuth.mockResolvedValue({ headers: new Headers(), user: { id: "u1" } });
  dbMocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  dbMocks.getUserRole.mockResolvedValue({ role: "member" });
}

describe("workspace settings RBAC", () => {
  beforeEach(() => {
    resetAll();
  });

  describe("settings action", () => {
    test("rejects caller for addUser, updateUser, deleteUser, cancelInvite, and updateWebhook", async () => {
      const mod = await import("../app/routes/workspaces+/$id/settings.action.server");

      for (const formName of ["addUser", "updateUser", "deleteUser", "cancelInvite", "updateWebhook"]) {
        const fd = new FormData();
        fd.set("formName", formName);
        const res = await asRouteResponse(mod.action(
            await withWorkspaceRouteArgs(
              { request: buildRequest(fd), params: { id: "w1" } },
              { userId: "u1", workspaceId: "w1", userRole: "caller" },
            ),
          ),
        );
        expect(res.status).toBe(403);
      }

      expect(utilsMocks.handleAddUser).not.toHaveBeenCalled();
      expect(utilsMocks.handleUpdateUser).not.toHaveBeenCalled();
      expect(utilsMocks.handleDeleteUser).not.toHaveBeenCalled();
      expect(utilsMocks.removeInvite).not.toHaveBeenCalled();
      expect(utilsMocks.handleUpdateWebhook).not.toHaveBeenCalled();
    });

    test("rejects non-owner for transferWorkspaceOwnership and deleteWorkspace", async () => {
      const mod = await import("../app/routes/workspaces+/$id/settings.action.server");

      for (const formName of ["transferWorkspaceOwnership", "deleteWorkspace"]) {
        const fd = new FormData();
        fd.set("formName", formName);
        const res = await asRouteResponse(mod.action(
            await withWorkspaceRouteArgs(
              { request: buildRequest(fd), params: { id: "w1" } },
              { userId: "u1", workspaceId: "w1", userRole: "admin" },
            ),
          ),
        );
        expect(res.status).toBe(403);
      }

      expect(utilsMocks.handleTransferWorkspace).not.toHaveBeenCalled();
      expect(utilsMocks.handleDeleteWorkspace).not.toHaveBeenCalled();
    });

    test("rejects deleteSelf when form user_id does not match the session user", async () => {
      const mod = await import("../app/routes/workspaces+/$id/settings.action.server");

      const fd = new FormData();
      fd.set("formName", "deleteSelf");
      fd.set("user_id", "u2");
      const res = await asRouteResponse(mod.action(
          await withWorkspaceRouteArgs(
            { request: buildRequest(fd), params: { id: "w1" } },
            { userId: "u1", workspaceId: "w1", userRole: "member" },
          ),
        ),
      );
      expect(res.status).toBe(403);
      expect(utilsMocks.handleDeleteSelf).not.toHaveBeenCalled();
    });

    test("uses the session user id for transferWorkspaceOwnership, not the form", async () => {
      const mod = await import("../app/routes/workspaces+/$id/settings.action.server");

      const fd = new FormData();
      fd.set("formName", "transferWorkspaceOwnership");
      fd.set("workspace_owner_id", "forged-owner");
      fd.set("user_id", "u2");
      await mod.action(
        await withWorkspaceRouteArgs(
          { request: buildRequest(fd), params: { id: "w1" } },
          { userId: "u1", workspaceId: "w1", userRole: "owner" },
        ),
      );

      expect(utilsMocks.handleTransferWorkspace).toHaveBeenCalledWith(
        expect.any(FormData),
        "w1",
        expect.any(Headers),
        "u1",
      );
    });
  });

  describe("settings loader", () => {
    test("returns 404 for non-members via requireWorkspaceLoaderContext", async () => {
      dbMocks.getUserRole.mockResolvedValue(null);
      const mod = await import("../app/routes/workspaces+/$id/settings.loader.server");

      const res = await asRouteResponse(mod.loader({
          request: new Request("http://localhost"),
          params: { id: "w1" },
          context: await createRouteContextProvider({ workspace: null }),
        }),
      );
      expect(res.status).toBe(404);
      expect(settingsPageMocks.getWorkspaceSettingsPageData).not.toHaveBeenCalled();
    });
  });

  describe("settings/numbers loader", () => {
    test("returns 404 for non-members", async () => {
      dbMocks.requireWorkspaceAccess.mockRejectedValue(new Error("Workspace not found"));
      const mod = await import("../app/routes/workspaces+/$id/settings/numbers.loader.server");

      const res = await asRouteResponse(mod.loader(
          await withWorkspaceRouteArgs(
            { request: new Request("http://localhost"), params: { id: "w1" } },
            { userId: "u1", workspaceId: "w1", userRole: "member" },
          ),
        ),
      );
      expect(res.status).toBe(404);
    });
  });
});

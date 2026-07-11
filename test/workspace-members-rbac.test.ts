import { beforeEach, describe, expect, test, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => undefined),
  getUserRole: vi.fn(async () => ({ role: "member" })),
  getWorkspaceUsers: vi.fn(async () => ({ data: [] })),
}));

const membersDbMocks = vi.hoisted(() => ({
  findWorkspaceMembership: vi.fn(async (_workspaceId: string, userId: string) => ({
    user_id: userId,
    role: "member",
  })),
  listWorkspaceMembersEnriched: vi.fn(async () => [] as any[]),
  updateWorkspaceMemberRole: vi.fn(async () => ({ id: "u2" } as any)),
  removeWorkspaceMember: vi.fn(async () => ({ id: "u2" } as any)),
}));

const txDb = vi.hoisted(() => ({
  workspace_users: {
    findFirst: vi.fn(async () => null as any),
    update: vi.fn(async () => [{ id: "u2" }] as any[]),
  },
}));

const dbMock = vi.hoisted(() => ({
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
}));

const tenantDbMock = vi.hoisted(() => ({
  createTenantDb: vi.fn(() => txDb),
}));

vi.mock("@/lib/database.server", () => ({ ...accessMocks }));
vi.mock("@/lib/workspace-members-db.server", () => ({ ...membersDbMocks }));
vi.mock("@/server/db", () => ({ db: dbMock }));
vi.mock("@/server/tenant-db", () => ({ ...tenantDbMock }));

function resetAll() {
  accessMocks.requireWorkspaceAccess.mockReset();
  accessMocks.getUserRole.mockReset();
  accessMocks.getWorkspaceUsers.mockReset();
  membersDbMocks.findWorkspaceMembership.mockReset();
  membersDbMocks.listWorkspaceMembersEnriched.mockReset();
  membersDbMocks.updateWorkspaceMemberRole.mockReset();
  membersDbMocks.removeWorkspaceMember.mockReset();
  txDb.workspace_users.findFirst.mockReset();
  txDb.workspace_users.update.mockReset();
  dbMock.transaction.mockReset();

  accessMocks.requireWorkspaceAccess.mockResolvedValue(undefined);
  accessMocks.getUserRole.mockResolvedValue({ role: "member" });
  accessMocks.getWorkspaceUsers.mockResolvedValue({ data: [] });
  membersDbMocks.findWorkspaceMembership.mockImplementation(async (_workspaceId, userId) => ({
    user_id: userId,
    role: "member",
  }));
  membersDbMocks.listWorkspaceMembersEnriched.mockResolvedValue([]);
  membersDbMocks.updateWorkspaceMemberRole.mockResolvedValue({ id: "u2" });
  membersDbMocks.removeWorkspaceMember.mockResolvedValue({ id: "u2" });
  txDb.workspace_users.findFirst.mockResolvedValue({ id: "u2" });
  txDb.workspace_users.update.mockResolvedValue([{ id: "u2" }]);
  dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb));
}

describe("workspace member RBAC", () => {
  beforeEach(() => {
    vi.resetModules();
    resetAll();
  });

  describe("platform-members updateWorkspaceMemberRole", () => {
    test("rejects callers", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "caller" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "member");
      expect(result).toMatchObject({ ok: false, status: 403 });
    });

    test("rejects non-owners from assigning the owner role", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "admin" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "owner");
      expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("owner") });
    });

    test("allows owners to assign the owner role", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "owner" });
      membersDbMocks.findWorkspaceMembership.mockImplementation(async (_, userId) => ({
        user_id: userId,
        role: userId === "u1" ? "owner" : "member",
      }));
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "owner");
      expect(result).toEqual({ ok: true, member: { id: "u2" } });
    });

    test("prevents demoting the sole owner", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "owner" });
      membersDbMocks.findWorkspaceMembership.mockResolvedValue({ user_id: "u1", role: "owner" });
      membersDbMocks.listWorkspaceMembersEnriched.mockResolvedValue([
        { user_id: "u1", role: "owner" },
      ]);
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u1", "admin");
      expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("sole owner") });
    });

    test("blocks a member from promoting anyone to admin (privilege escalation)", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "member" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "admin");
      expect(result).toMatchObject({
        ok: false,
        status: 403,
        error: expect.stringContaining("higher than your own"),
      });
      expect(membersDbMocks.updateWorkspaceMemberRole).not.toHaveBeenCalled();
    });

    test("blocks a member from self-promoting to admin", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "member" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u1", "admin");
      expect(result).toMatchObject({ ok: false, status: 403 });
      expect(membersDbMocks.updateWorkspaceMemberRole).not.toHaveBeenCalled();
    });

    test("allows an admin to assign a member role (no escalation)", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "admin" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "member");
      expect(result).toEqual({ ok: true, member: { id: "u2" } });
    });
  });

  describe("platform-members inviteWorkspaceMember", () => {
    test("blocks a member from inviting an admin (privilege escalation)", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "member" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.inviteWorkspaceMember(
        "u1",
        "w1",
        "new@example.com",
        "admin",
      );
      expect(result).toMatchObject({
        ok: false,
        status: 403,
        error: expect.stringContaining("higher than your own"),
      });
      // Blocked before any user lookup / invite send.
      expect(accessMocks.getWorkspaceUsers).not.toHaveBeenCalled();
    });
  });

  describe("platform-members removeWorkspaceMember", () => {
    test("rejects callers", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "caller" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.removeWorkspaceMember("u1", "w1", "u2");
      expect(result).toMatchObject({ ok: false, status: 403 });
    });

    test("rejects non-owners from removing an owner", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "admin" });
      membersDbMocks.findWorkspaceMembership.mockResolvedValue({ user_id: "u2", role: "owner" });
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.removeWorkspaceMember("u1", "w1", "u2");
      expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("owner") });
    });

    test("prevents removing the sole owner", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "owner" });
      membersDbMocks.findWorkspaceMembership.mockResolvedValue({ user_id: "u2", role: "owner" });
      membersDbMocks.listWorkspaceMembersEnriched.mockResolvedValue([
        { user_id: "u2", role: "owner" },
      ]);
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.removeWorkspaceMember("u1", "w1", "u2");
      expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("sole owner") });
    });
  });

  describe("transferWorkspaceOwnership", () => {
    test("verifies the new owner is an existing member", async () => {
      txDb.workspace_users.findFirst.mockResolvedValue(null);
      const actual = await vi.importActual<typeof import("../app/lib/workspace-members-db.server")>(
        "../app/lib/workspace-members-db.server",
      );
      await expect(
        actual.transferWorkspaceOwnership({
          workspaceId: "w1",
          currentOwnerUserId: "u1",
          newOwnerUserId: "u2",
        }),
      ).rejects.toThrow("existing workspace member");
      expect(txDb.workspace_users.update).not.toHaveBeenCalled();
    });

    test("rolls back when the new owner update affects zero rows", async () => {
      txDb.workspace_users.findFirst.mockResolvedValue({ id: "u2" });
      txDb.workspace_users.update.mockResolvedValue([]);
      const actual = await vi.importActual<typeof import("../app/lib/workspace-members-db.server")>(
        "../app/lib/workspace-members-db.server",
      );
      await expect(
        actual.transferWorkspaceOwnership({
          workspaceId: "w1",
          currentOwnerUserId: "u1",
          newOwnerUserId: "u2",
        }),
      ).rejects.toThrow("new owner");
    });

    test("promotes the new owner and demotes the previous owner in a transaction", async () => {
      txDb.workspace_users.findFirst.mockResolvedValue({ id: "u2" });
      txDb.workspace_users.update.mockResolvedValue([{ id: "updated" }]);
      const actual = await vi.importActual<typeof import("../app/lib/workspace-members-db.server")>(
        "../app/lib/workspace-members-db.server",
      );
      const result = await actual.transferWorkspaceOwnership({
        workspaceId: "w1",
        currentOwnerUserId: "u1",
        newOwnerUserId: "u2",
      });
      expect(result).toMatchObject({ newOwner: { id: "updated" }, previousOwner: { id: "updated" } });
      expect(dbMock.transaction).toHaveBeenCalled();
      expect(txDb.workspace_users.update).toHaveBeenCalledTimes(2);
    });
  });
});

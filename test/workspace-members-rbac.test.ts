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
  workspace_member: {
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

const twoFactorMocks = vi.hoisted(() => ({
  isTwoFactorEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/two-factor.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/two-factor.server")>();
  return {
    ...actual,
    isTwoFactorEnabled: (...args: unknown[]) =>
      twoFactorMocks.isTwoFactorEnabled(...(args as [string])),
    requireTwoFactorForPrivilegedRoleAssignment: async (
      targetUserId: string,
      role: string,
    ) => {
      if (!actual.isPrivilegedWorkspaceRole(role)) {
        return { ok: true as const };
      }
      const enrolled = await twoFactorMocks.isTwoFactorEnabled(targetUserId);
      if (!enrolled) {
        return {
          ok: false as const,
          error:
            "The user must enroll in two-factor authentication before receiving an owner or admin role.",
          status: 403,
        };
      }
      return { ok: true as const };
    },
  };
});

vi.mock("@/lib/database/workspace.server", () => ({ ...accessMocks }));
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
  txDb.workspace_member.findFirst.mockReset();
  txDb.workspace_member.update.mockReset();
  dbMock.transaction.mockReset();

  twoFactorMocks.isTwoFactorEnabled.mockReset();
  twoFactorMocks.isTwoFactorEnabled.mockResolvedValue(true);

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
  txDb.workspace_member.findFirst.mockResolvedValue({ id: "u2" });
  txDb.workspace_member.update.mockResolvedValue([{ id: "u2" }]);
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

    test("blocks a member from demoting an admin (target outranks actor)", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "member" });
      // Target u2 is an admin; actor u1 is only a member.
      membersDbMocks.findWorkspaceMembership.mockImplementation(async (_ws, userId) => ({
        user_id: userId,
        role: userId === "u2" ? "admin" : "member",
      }));
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "caller");
      expect(result).toMatchObject({ ok: false, status: 403 });
      expect(membersDbMocks.updateWorkspaceMemberRole).not.toHaveBeenCalled();
    });

    test("blocks promoting to admin when target has not enrolled in 2FA", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "owner" });
      twoFactorMocks.isTwoFactorEnabled.mockResolvedValueOnce(false);
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.updateWorkspaceMemberRole("u1", "w1", "u2", "admin");
      expect(result).toMatchObject({
        ok: false,
        status: 403,
        error: expect.stringContaining("two-factor"),
      });
      expect(membersDbMocks.updateWorkspaceMemberRole).not.toHaveBeenCalled();
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
      // Actor u1 is an admin, target u2 is an owner: the owner-change gate fires.
      membersDbMocks.findWorkspaceMembership.mockImplementation(async (_ws, userId) => ({
        user_id: userId,
        role: userId === "u2" ? "owner" : "admin",
      }));
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

    test("blocks a member from removing an admin (target outranks actor)", async () => {
      accessMocks.getUserRole.mockResolvedValue({ role: "member" });
      // Target u2 is an admin (not an owner, so the owner gate passes).
      membersDbMocks.findWorkspaceMembership.mockImplementation(async (_ws, userId) => ({
        user_id: userId,
        role: userId === "u2" ? "admin" : "member",
      }));
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.removeWorkspaceMember("u1", "w1", "u2");
      expect(result).toMatchObject({ ok: false, status: 403 });
      expect(membersDbMocks.removeWorkspaceMember).not.toHaveBeenCalled();
    });
  });

  describe("platform-members inviteWorkspaceMemberAsApiKey", () => {
    test("blocks an API key from inviting an admin (member/caller-only policy)", async () => {
      const mod = await import("../app/lib/platform-members.server");
      const result = await mod.inviteWorkspaceMemberAsApiKey("w1", "new@example.com", "admin");
      expect(result).toMatchObject({ ok: false, status: 403 });
      // Blocked at the escalation guard, before any user lookup / invite send.
      expect(accessMocks.getWorkspaceUsers).not.toHaveBeenCalled();
    });
  });

  describe("transferWorkspaceOwnership", () => {
    test("verifies the new owner is an existing member", async () => {
      txDb.workspace_member.findFirst.mockResolvedValue(null);
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
      expect(txDb.workspace_member.update).not.toHaveBeenCalled();
    });

    test("rolls back when the new owner update affects zero rows", async () => {
      txDb.workspace_member.findFirst.mockResolvedValue({ id: "u2", role_id: "member" });
      txDb.workspace_member.update.mockResolvedValue([]);
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

    test("rejects when the new owner has not enrolled in 2FA (#1519)", async () => {
      twoFactorMocks.isTwoFactorEnabled.mockResolvedValueOnce(false);
      const actual = await vi.importActual<typeof import("../app/lib/workspace-members-db.server")>(
        "../app/lib/workspace-members-db.server",
      );
      await expect(
        actual.transferWorkspaceOwnership({
          workspaceId: "w1",
          currentOwnerUserId: "u1",
          newOwnerUserId: "u2",
        }),
      ).rejects.toThrow("two-factor");
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    test("promotes the new owner and demotes the previous owner in a transaction", async () => {
      txDb.workspace_member.findFirst.mockResolvedValue({ id: "u2", role_id: "member" });
      txDb.workspace_member.update.mockResolvedValue([{ id: "updated", role_id: "owner" }]);
      const actual = await vi.importActual<typeof import("../app/lib/workspace-members-db.server")>(
        "../app/lib/workspace-members-db.server",
      );
      const result = await actual.transferWorkspaceOwnership({
        workspaceId: "w1",
        currentOwnerUserId: "u1",
        newOwnerUserId: "u2",
      });
      expect(result).toMatchObject({
        newOwner: { id: "updated" },
        previousOwner: { id: "updated" },
      });
      expect(dbMock.transaction).toHaveBeenCalled();
      expect(txDb.workspace_member.update).toHaveBeenCalledTimes(2);
    });
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import { InviteError } from "@chester-hill-solutions/auth";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

const pkgMocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  redeemInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  resendInvitation: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendWorkspaceInviteEmail: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { select: dbMocks.select },
}));

vi.mock("@chester-hill-solutions/auth-postgres", () => ({
  createInvitation: pkgMocks.createInvitation,
  redeemInvitation: pkgMocks.redeemInvitation,
  cancelInvitation: pkgMocks.cancelInvitation,
  listPendingInvitations: pkgMocks.listPendingInvitations,
  resendInvitation: pkgMocks.resendInvitation,
}));

vi.mock("@/lib/send-workspace-invite-email.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/send-workspace-invite-email.server")>()),
  sendWorkspaceInviteEmail: emailMocks.sendWorkspaceInviteEmail,
}));

/** Chainable fake for `db.select().from().where().limit()` used by the module. */
function chainReturning(rows: unknown[]) {
  dbMocks.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => rows),
      })),
    })),
  });
}

const pendingRow = {
  id: "wi_pending",
  workspace_id: "w1",
  email: "invitee@example.com",
  role_id: "member",
  invited_by_user_id: "u-admin",
  token_hash: "a".repeat(64),
  status: "pending",
  expires_at: new Date(Date.now() + 86400000),
  accepted_at: null,
  accepted_by_user_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe("workspace-invitations.server (SEC-03 email-first)", () => {
  beforeEach(() => {
    dbMocks.select.mockReset();
    pkgMocks.createInvitation.mockReset();
    pkgMocks.redeemInvitation.mockReset();
    pkgMocks.cancelInvitation.mockReset();
    pkgMocks.resendInvitation.mockReset();
    emailMocks.sendWorkspaceInviteEmail.mockReset();
  });

  describe("inviteUserByEmail", () => {
    test("creates an email-first invite for an unknown email and sends the link", async () => {
      const mod = await import("../app/lib/invite-user-by-email.server");
      chainReturning([]);
      pkgMocks.createInvitation.mockResolvedValueOnce({
        invitation: {
          id: "wi_new",
          workspaceId: "w1",
          email: "invitee@example.com",
          roleId: "member",
          status: "pending",
          createdAt: new Date("2026-09-21T00:00:00.000Z"),
          expiresAt: new Date("2026-09-28T00:00:00.000Z"),
        },
        rawToken: "secret-token",
      });

      const result = await mod.inviteUserByEmail({
        workspaceId: "w1",
        email: "  INVITEE@example.com ",
        role: "member",
        invitedByUserId: "u-admin",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.invite).toMatchObject({
        id: "wi_new",
        email: "invitee@example.com",
        role: "member",
        status: "pending",
        workspace: "w1",
        isNew: true,
      });
      expect(pkgMocks.createInvitation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: "invitee@example.com",
          roleId: "member",
          invitedByUserId: "u-admin",
        }),
      );
      expect(emailMocks.sendWorkspaceInviteEmail).toHaveBeenCalledTimes(1);
      const emailArgs = emailMocks.sendWorkspaceInviteEmail.mock.calls[0][0];
      expect(emailArgs.rawToken).toBe("secret-token");
      expect(emailArgs.invitationId).toBe("wi_new");
    });

    test("returns a warning and does not create or email again when one is pending", async () => {
      const mod = await import("../app/lib/invite-user-by-email.server");
      chainReturning([pendingRow]);

      const result = await mod.inviteUserByEmail({
        workspaceId: "w1",
        email: "invitee@example.com",
        role: "member",
        invitedByUserId: "u-admin",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warning).toBe("An invite is already pending for this email.");
      expect(pkgMocks.createInvitation).not.toHaveBeenCalled();
      expect(emailMocks.sendWorkspaceInviteEmail).not.toHaveBeenCalled();
    });

    test("maps a creation failure to a user-safe error", async () => {
      const mod = await import("../app/lib/invite-user-by-email.server");
      chainReturning([]);
      pkgMocks.createInvitation.mockRejectedValueOnce(new Error("boom"));

      const result = await mod.inviteUserByEmail({
        workspaceId: "w1",
        email: "invitee@example.com",
        role: "member",
        invitedByUserId: "u-admin",
      });

      expect(result).toEqual({
        ok: false,
        error: "Could not create the invitation. Please try again.",
        status: 500,
      });
    });
  });

  describe("redeemWorkspaceInvitation", () => {
    test("redeems with a matching token and returns the workspace", async () => {
      const mod = await import("../app/lib/workspace-invitations.server");
      chainReturning([pendingRow]);
      pkgMocks.redeemInvitation.mockResolvedValueOnce({
        invitation: pendingRow,
        membershipId: "wm:w1:u1",
        alreadyAccepted: false,
      });

      const result = await mod.redeemWorkspaceInvitation({
        invitationId: "wi_pending",
        rawToken: "secret-token",
        userId: "u1",
        verifiedEmail: "invitee@example.com",
      });

      expect(result).toEqual({ ok: true, workspaceId: "w1", alreadyAccepted: false });
      expect(pkgMocks.redeemInvitation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          invitationId: "wi_pending",
          rawToken: "secret-token",
          userId: "u1",
          verifiedEmail: "invitee@example.com",
          membershipId: "wm:w1:u1",
        }),
      );
    });

    test("returns the invite error status when the token is wrong", async () => {
      const mod = await import("../app/lib/workspace-invitations.server");
      chainReturning([pendingRow]);
      const err = new InviteError("Invalid invitation token", "INVITE_TOKEN_INVALID", 403);
      pkgMocks.redeemInvitation.mockRejectedValueOnce(err);

      const result = await mod.redeemWorkspaceInvitation({
        invitationId: "wi_pending",
        rawToken: "wrong",
        userId: "u1",
        verifiedEmail: "invitee@example.com",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(403);
      expect(result.error).toBe("Invalid invitation token");
    });

    test("404s when the invitation does not exist", async () => {
      const mod = await import("../app/lib/workspace-invitations.server");
      chainReturning([]);

      const result = await mod.redeemWorkspaceInvitation({
        invitationId: "wi_ghost",
        rawToken: "x",
        userId: "u1",
        verifiedEmail: "nobody@example.com",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(404);
      expect(pkgMocks.redeemInvitation).not.toHaveBeenCalled();
    });
  });
});
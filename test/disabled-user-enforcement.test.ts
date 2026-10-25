import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * #2874: the admin "Disable user" control wrote `access_level = "disabled"` and
 * nothing read it, so a disabled account kept its live session and could sign in
 * again. `disabled` now means "no authority" at both session-resolution paths,
 * and disabling revokes the account's sessions.
 */
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  deleteWhere: vi.fn(async () => undefined),
  delete: vi.fn(),
  revokeAll: vi.fn(async () => undefined),
}));

vi.mock("@/server/auth-instance", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mocks.getSession(...args) },
  },
}));

vi.mock("@/server/admin-db", () => {
  const selectChain = {
    from: () => selectChain,
    leftJoin: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: (...args: unknown[]) => mocks.select(...args),
  };
  const deleteChain = {
    where: (...args: unknown[]) => mocks.deleteWhere(...args),
  };
  return {
    adminDb: {
      select: () => selectChain,
      delete: () => {
        mocks.delete();
        return deleteChain;
      },
    },
  };
});

vi.mock("@/lib/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth.server")>()),
  revokeAllSessionsForUser: (...args: unknown[]) => mocks.revokeAll(...args),
}));

vi.mock("@/lib/workspace-members-db.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/workspace-members-db.server")
  >()),
  updateUserAccessLevel: async () => ({ id: "u1", access_level: "disabled" }),
}));

function sessionPayload(userId: string) {
  return {
    response: {
      session: {
        token: "tok",
        expiresAt: new Date(Date.now() + 60_000),
        userId,
      },
      user: { id: userId, email: "a@b.com", name: "A" },
    },
    headers: new Headers(),
  };
}

describe("disabled accounts hold no authority (#2874)", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.select.mockReset();
    mocks.deleteWhere.mockReset();
    mocks.delete.mockReset();
    mocks.revokeAll.mockReset();
  });

  test("a cookie session for a disabled account resolves as unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(sessionPayload("u1"));
    mocks.select.mockResolvedValue([{ accessLevel: "disabled" }]);

    const { getSession } = await import("@/lib/auth.server");
    const result = await getSession(new Request("http://x/"));

    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
  });

  test("a cookie session for a standard account still resolves", async () => {
    mocks.getSession.mockResolvedValue(sessionPayload("u1"));
    mocks.select.mockResolvedValue([{ accessLevel: "standard" }]);

    const { getSession } = await import("@/lib/auth.server");
    const result = await getSession(new Request("http://x/"));

    expect(result.user?.id).toBe("u1");
  });

  test("a bearer token for a disabled account resolves to no user", async () => {
    mocks.select.mockResolvedValue([
      { userId: "u1", email: "a@b.com", name: "A", accessLevel: "disabled" },
    ]);

    const { resolveBearerSessionUser } = await import("@/lib/auth.server");
    await expect(resolveBearerSessionUser("tok")).resolves.toBeNull();
  });

  test("a bearer token for a standard account still resolves", async () => {
    mocks.select.mockResolvedValue([
      { userId: "u1", email: "a@b.com", name: "A", accessLevel: "standard" },
    ]);

    const { resolveBearerSessionUser } = await import("@/lib/auth.server");
    await expect(resolveBearerSessionUser("tok")).resolves.toMatchObject({
      id: "u1",
    });
  });

  test("disabling an account revokes its sessions", async () => {
    const { disableUser } = await import("@/lib/platform-admin.server");
    const result = await disableUser("u1");

    expect(result).toEqual({ ok: true });
    expect(mocks.revokeAll).toHaveBeenCalledWith("u1");
  });
});

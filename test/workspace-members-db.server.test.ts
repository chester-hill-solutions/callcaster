import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const adminDbMocks = vi.hoisted(() => ({
  workspaceUsersRows: [] as Array<{ user_id: string }>,
  authUserRows: [] as Array<{ email: string }>,
  fromCalls: [] as string[],
}));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    select: vi.fn(() => ({
      from: vi.fn((table: { [Symbol.toStringTag]?: string } & Record<string, unknown>) => {
        // Distinguish the workspace_users query from the auth_user query by
        // call order: listWorkspaceOwnerAdminEmails always queries
        // workspace_users first, then auth_user.
        const isFirstCall = adminDbMocks.fromCalls.length === 0;
        adminDbMocks.fromCalls.push(String(table));
        return {
          where: vi.fn(async () =>
            isFirstCall ? adminDbMocks.workspaceUsersRows : adminDbMocks.authUserRows,
          ),
        };
      }),
    })),
  },
}));

vi.mock("@/server/db", () => ({ db: {} }));

describe("app/lib/workspace-members-db.server.ts listWorkspaceOwnerAdminEmails", () => {
  beforeEach(() => {
    vi.resetModules();
    adminDbMocks.workspaceUsersRows = [];
    adminDbMocks.authUserRows = [];
    adminDbMocks.fromCalls = [];
  });

  test("returns deduped owner/admin emails", async () => {
    adminDbMocks.workspaceUsersRows = [
      { user_id: "u1" },
      { user_id: "u2" },
      { user_id: "u1" },
    ];
    adminDbMocks.authUserRows = [
      { email: "owner@example.com" },
      { email: "admin@example.com" },
      { email: "owner@example.com" },
    ];

    const mod = await import("../app/lib/workspace-members-db.server");
    const emails = await mod.listWorkspaceOwnerAdminEmails("w1");

    expect(emails.sort()).toEqual(["admin@example.com", "owner@example.com"]);
  });

  test("returns an empty array without querying auth_user when there are no owner/admin members", async () => {
    adminDbMocks.workspaceUsersRows = [];

    const mod = await import("../app/lib/workspace-members-db.server");
    const emails = await mod.listWorkspaceOwnerAdminEmails("w1");

    expect(emails).toEqual([]);
    expect(adminDbMocks.fromCalls).toHaveLength(1);
  });
});

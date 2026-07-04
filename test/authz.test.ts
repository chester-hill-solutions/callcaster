import { describe, expect, test, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";
});

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

let membershipRole: string | null = null;
vi.mock("@/server/tenant-db", () => ({
  createTenantDb: () => ({
    workspace_users: {
      findFirst: async () =>
        membershipRole ? { role: membershipRole } : null,
    },
  }),
}));

import { requireWorkspaceAccess } from "@/lib/database/workspace.server";

describe("requireWorkspaceAccess", () => {
  beforeEach(() => {
    membershipRole = null;
  });

  test.each(["owner", "admin", "member", "caller"])(
    "permits role %s",
    async (role) => {
      membershipRole = role;
      await expect(
        requireWorkspaceAccess({
          user: { id: "u1" },
          workspaceId: "w1",
        }),
      ).resolves.toBeUndefined();
    },
  );

  test("rejects when no membership exists (404, no workspace-id inference)", async () => {
    membershipRole = null;
    await expect(
      requireWorkspaceAccess({
        user: { id: "u1" },
        workspaceId: "w1",
      }),
    ).rejects.toMatchObject({
      name: "AppError",
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  test("rejects unknown role (member with invalid role string -> 403)", async () => {
    membershipRole = "viewer";
    await expect(
      requireWorkspaceAccess({
        user: { id: "u1" },
        workspaceId: "w1",
      }),
    ).rejects.toMatchObject({
      name: "AppError",
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});

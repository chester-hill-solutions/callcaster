import { describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

import { requireWorkspaceAccess } from "@/lib/database/workspace.server";

function makeDbClientForRole(role: string | null) {
  return {
    from: (table: string) => {
      if (table !== "workspace_users") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: role ? { role } : null,
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  } as any;
}

describe("requireWorkspaceAccess", () => {
  test.each(["owner", "admin", "member", "caller"])(
    "permits role %s",
    async (role) => {
      const null = makeDbClientForRole(role);
      await expect(
        requireWorkspaceAccess({
          user: { id: "u1" },
          workspaceId: "w1",
        }),
      ).resolves.toBeUndefined();
    },
  );

  test("rejects when no membership exists (404, no workspace-id inference)", async () => {
    const null = makeDbClientForRole(null);
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
    const null = makeDbClientForRole("viewer");
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


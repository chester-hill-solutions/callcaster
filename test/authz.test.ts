import { describe, expect, test, vi } from "vitest";

// Avoid env validation noise when importing server modules in tests.
vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

import { requireWorkspaceAccess } from "@/lib/database/workspace.server";

function makeSupabaseForRole(role: string | null) {
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
      const supabaseClient = makeSupabaseForRole(role);
      await expect(
        requireWorkspaceAccess({
          supabaseClient,
          user: { id: "u1" },
          workspaceId: "w1",
        }),
      ).resolves.toBeUndefined();
    },
  );

  test("rejects when no membership exists", async () => {
    const supabaseClient = makeSupabaseForRole(null);
    await expect(
      requireWorkspaceAccess({
        supabaseClient,
        user: { id: "u1" },
        workspaceId: "w1",
      }),
    ).rejects.toMatchObject({
      name: "AppError",
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  test("rejects unknown role", async () => {
    const supabaseClient = makeSupabaseForRole("viewer");
    await expect(
      requireWorkspaceAccess({
        supabaseClient,
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


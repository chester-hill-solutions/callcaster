import { beforeEach, describe, expect, test, vi } from "vitest";

const workspaceDbMocks = vi.hoisted(() => ({
  getWorkspaceById: vi.fn(),
  listWorkspaceMembersEnriched: vi.fn(),
  listWorkspaceInvitesEnriched: vi.fn(),
  getWorkspaceWebhookRow: vi.fn(),
}));

const tdbMocks = vi.hoisted(() => ({
  workspace_number: {
    findMany: vi.fn(),
  },
}));

describe("app/lib/workspace-settings-db.server.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(workspaceDbMocks)) {
      fn.mockReset();
    }
    tdbMocks.workspace_number.findMany.mockReset();

    vi.doMock("@/lib/workspace-members-db.server", () => workspaceDbMocks);
    vi.doMock("@/server/tenant-db", () => ({
      createTenantDb: vi.fn(() => tdbMocks),
    }));
  });

  test("getWorkspaceSettingsPageData composes workspace settings payload", async () => {
    workspaceDbMocks.getWorkspaceById.mockResolvedValueOnce({
      id: "w1",
      name: "Acme",
    });
    workspaceDbMocks.listWorkspaceMembersEnriched.mockResolvedValueOnce([
      {
        user_id: "u1",
        username: "owner@example.com",
        first_name: "O",
        last_name: "W",
        role: "owner",
      },
      {
        user_id: "u2",
        username: "caller@example.com",
        first_name: "C",
        last_name: "A",
        role: "caller",
      },
    ]);
    tdbMocks.workspace_number.findMany.mockResolvedValueOnce([
      {
        id: 1,
        phone_number: "+15550001111",
        capabilities: { verification_status: "success" },
      },
    ]);
    workspaceDbMocks.listWorkspaceInvitesEnriched.mockResolvedValueOnce([
      {
        id: "inv1",
        user_id: "u3",
        user: { id: "u3", username: "pending@example.com" },
      },
    ]);
    workspaceDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce({
      id: 9,
      destination_url: "https://example.com/hook",
      event: ["INSERT"],
    });

    const mod = await import("../app/lib/workspace-settings-db.server");
    const result = await mod.getWorkspaceSettingsPageData("w1", "u1");

    expect(result).toMatchObject({
      workspace: { id: "w1", name: "Acme" },
      userRole: "owner",
      users: [
        { id: "u1", username: "owner@example.com", role: "owner" },
        { id: "u2", username: "caller@example.com", role: "caller" },
      ],
      phoneNumbers: [{ id: 1, phone_number: "+15550001111" }],
      pendingInvites: [
        expect.objectContaining({
          id: "inv1",
          user: { id: "u3", username: "pending@example.com" },
        }),
      ],
      webhook: { id: 9, destination_url: "https://example.com/hook" },
      hasAccess: true,
    });
  });

  test("getWorkspaceSettingsPageData denies caller access", async () => {
    workspaceDbMocks.getWorkspaceById.mockResolvedValueOnce({
      id: "w1",
      name: "Acme",
    });
    workspaceDbMocks.listWorkspaceMembersEnriched.mockResolvedValueOnce([
      {
        user_id: "u2",
        username: "caller@example.com",
        first_name: null,
        last_name: null,
        role: "caller",
      },
    ]);
    tdbMocks.workspace_number.findMany.mockResolvedValueOnce([]);
    workspaceDbMocks.listWorkspaceInvitesEnriched.mockResolvedValueOnce([]);
    workspaceDbMocks.getWorkspaceWebhookRow.mockResolvedValueOnce(null);

    const mod = await import("../app/lib/workspace-settings-db.server");
    const result = await mod.getWorkspaceSettingsPageData("w1", "u2");

    expect(result.userRole).toBe("caller");
    expect(result.hasAccess).toBe(false);
  });

  test("getWorkspaceSettingsPageData throws when workspace missing", async () => {
    workspaceDbMocks.getWorkspaceById.mockResolvedValueOnce(null);

    const mod = await import("../app/lib/workspace-settings-db.server");
    await expect(mod.getWorkspaceSettingsPageData("missing", "u1")).rejects.toThrow(
      "Workspace not found",
    );
  });
});

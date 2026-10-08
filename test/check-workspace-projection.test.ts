import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
const guard = resolve("scripts/check-workspace-projection.mjs");
function check(file: string, source: string) {
  const root = mkdtempSync(join(tmpdir(), "workspace-projection-"));
  try {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    return spawnSync(process.execPath, [guard], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
describe("workspace projection guard", () => {
  test.each([
    {
      file: "app/routes/admin+/admin.types.ts",
      source: 'type Workspace = Pick<Tables<"workspace">, "id" | "token">;',
    },
    {
      file: "app/routes/workspaces+/settings.loader.server.ts",
      source:
        'import { getWorkspaceById } from "@/lib/workspace-members-db.server";',
    },
    {
      file: "app/routes/admin+/route.loader.server.ts",
      source:
        'import { listAllWorkspacesOrdered as list } from "@/lib/workspace-members-db.server";',
    },
    {
      file: "app/routes/api+/admin+/dashboard.loader.server.ts",
      source:
        'import {\n getWorkspaceWithCampaigns\n } from "@/lib/workspace-members-db.server";',
    },
    {
      file: "app/routes/admin+/users.route.tsx",
      source:
        'export { listUserWorkspaceMembershipsWithWorkspace } from "@/lib/workspace-members-db.server";',
    },
    {
      file: "app/routes/admin+/invites.action.server.ts",
      source:
        'import { listPendingInvitesForUsername } from "@/lib/workspace-invitations.server";',
    },
    {
      file: "app/routes/admin+/admin.types.ts",
      source: 'type Workspace = Tables<"workspace">;',
    },
    {
      file: "app/components/workspace/WorkspaceOverview.tsx",
      source: 'type Workspace = Tables<"workspace"> & { campaign: unknown[] };',
    },
  ])("rejects raw import or client type in $file", ({ file, source }) => {
    const result = check(file, source);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });
  test.each([
    {
      file: "app/routes/admin+/admin.types.ts",
      source: 'type Workspace = Pick<Tables<"workspace">, "id" | "name">;',
    },
    {
      file: "app/routes/admin+/route.loader.server.ts",
      source:
        'import { getAdminDashboard } from "@/lib/platform-admin.server";',
    },
    {
      file: "app/routes/admin+/twilio/loadTwilioData.server.ts",
      source:
        'import { getWorkspaceById } from "@/lib/workspace-members-db.server";',
    },
    {
      file: "app/routes/admin+/admin.types.ts",
      source: "type Workspace = WorkspaceClientData & { campaign: unknown[] };",
    },
    {
      file: "app/routes/workspaces+/settings.loader.server.ts",
      source:
        'import { getWorkspaceForClient } from "@/lib/workspace-client-projection.server";',
    },
  ])(
    "allows safe entry or server-only credential helper in $file",
    ({ file, source }) => {
      const result = check(file, source);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Workspace projection check passed");
    },
  );
});

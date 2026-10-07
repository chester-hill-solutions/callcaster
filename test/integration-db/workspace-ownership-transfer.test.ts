import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

vi.mock("@/lib/two-factor.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor.server")>()),
  isTwoFactorEnabled: vi.fn(async () => true),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "11111111-2222-4333-8444-777777777777";
const otherWorkspace = "aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff";
const owner = "11111111-2222-4333-8444-555555555555";
const target = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const message = "Choose a different member to transfer workspace ownership.";

suite("workspace ownership changes real distinct memberships (#2079)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withMembers(run: (tx: Database) => Promise<void>) {
    const { db } = await import("@/server/db");
    const rollback = new Error("Roll back isolated ownership fixtures");
    try {
      await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Database;
        await tx.execute(sql`insert into public.workspace (id, name) values
          (${workspace}, 'Ownership fixture'),
          (${otherWorkspace}, 'Ownership control')`);
        await tx.execute(sql`insert into public.workspace_member (id, workspace_id, user_id, role_id) values
          ('ownership-owner', ${workspace}, ${owner}, 'owner'),
          ('ownership-target', ${workspace}, ${target}, 'member'),
          ('ownership-other-owner', ${otherWorkspace}, ${owner}, 'owner'),
          ('ownership-other-target', ${otherWorkspace}, ${target}, 'caller')`);
        // Preserve the service transaction boundary using a real nested savepoint.
        const spy = vi
          .spyOn(db, "transaction")
          .mockImplementation((fn) => transaction.transaction(fn));
        try {
          await run(tx);
        } finally {
          spy.mockRestore();
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function roles(tx: Database) {
    return tx.execute(sql`select id, role_id from public.workspace_member
      where workspace_id in (${workspace}, ${otherWorkspace}) order by id`);
  }

  test("self transfer rejects without demoting the owner or changing other memberships", async () => {
    const { transferWorkspaceOwnership } =
      await import("@/lib/workspace-members-db.server");
    await withMembers(async (tx) => {
      const before = await roles(tx);
      await expect(
        transferWorkspaceOwnership({
          workspaceId: workspace,
          currentOwnerUserId: owner,
          newOwnerUserId: owner,
        }),
      ).rejects.toThrow(message);
      expect(await roles(tx)).toEqual(before);
    });
  });

  test("a distinct transfer promotes one real member and demotes the previous owner only in its workspace", async () => {
    const { transferWorkspaceOwnership } =
      await import("@/lib/workspace-members-db.server");
    await withMembers(async (tx) => {
      const result = await transferWorkspaceOwnership({
        workspaceId: workspace,
        currentOwnerUserId: owner,
        newOwnerUserId: target,
      });
      expect(result.newOwner.id).toBe("ownership-target");
      expect(result.previousOwner.id).toBe("ownership-owner");
      expect(await roles(tx)).toEqual([
        { id: "ownership-other-owner", role_id: "owner" },
        { id: "ownership-other-target", role_id: "caller" },
        { id: "ownership-owner", role_id: "admin" },
        { id: "ownership-target", role_id: "owner" },
      ]);
    });
  });

  test("failed previous-owner update rolls back the promotion", async () => {
    const { transferWorkspaceOwnership } =
      await import("@/lib/workspace-members-db.server");
    await withMembers(async (tx) => {
      const before = await roles(tx);
      await expect(
        transferWorkspaceOwnership({
          workspaceId: workspace,
          currentOwnerUserId: "22222222-3333-4444-8555-666666666666",
          newOwnerUserId: target,
        }),
      ).rejects.toThrow("Failed to demote the previous owner");
      expect(await roles(tx)).toEqual(before);
    });
  });
});

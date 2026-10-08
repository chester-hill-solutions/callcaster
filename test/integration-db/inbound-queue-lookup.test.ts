import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "11111111-2222-4333-8444-555555555555";
const otherWorkspace = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

suite("inbound queue lookup against Postgres (#2271)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withQueues(run: (lookup: (workspaceId: string, queueId: number) => Promise<{ id: number } | undefined>) => Promise<void>) {
    const { db } = await import("@/server/db");
    const tenant = await import("@/server/tenant-db");
    const createTenantDb = tenant.createTenantDb;
    const { findInboundQueueInWorkspace } = await import("@/lib/inbound-queue-db.server");
    await db.transaction(async (transaction) => {
      // Session-local rows retain the real query and tenant filter without changing app data.
      await transaction.execute(sql`create temporary table inbound_queue (like public.inbound_queue including defaults) on commit drop`);
      await transaction.execute(sql`insert into inbound_queue (id, workspace_id, name) values
        (7, ${workspace}, 'Owned'), (9, ${otherWorkspace}, 'Foreign')`);
      const tx = transaction as unknown as Database;
      const spy = vi.spyOn(tenant, "createTenantDb").mockImplementation((workspaceId) => createTenantDb(workspaceId, tx));
      try {
        await run((workspaceId, queueId) => findInboundQueueInWorkspace(workspaceId, queueId));
      } finally {
        spy.mockRestore();
      }
    });
  }

  test("selects the requested workspace-owned queue", async () => {
    await withQueues(async (lookup) => {
      expect(await lookup(workspace, 7)).toEqual({ id: 7 });
    });
  });

  test("does not select an existing queue in another workspace", async () => {
    await withQueues(async (lookup) => {
      expect(await lookup(workspace, 9)).toBeUndefined();
      expect(await lookup(otherWorkspace, 9)).toEqual({ id: 9 });
    });
  });

  test("a missing queue does not fall back to another owned queue", async () => {
    await withQueues(async (lookup) => {
      expect(await lookup(workspace, 99)).toBeUndefined();
    });
  });
});

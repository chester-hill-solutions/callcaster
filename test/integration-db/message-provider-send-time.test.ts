import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { TenantDb } from "@/server/tenant-db";

vi.mock("@/lib/workspace-events.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workspace-events.server")>()),
  emitChatMessageEvent: vi.fn(async () => undefined),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = randomUUID();
const sid = "SMprovider_send_time_fixture";
const first = new Date("2026-10-05T10:11:12.345Z");
const later = new Date("2026-10-05T12:13:14.567Z");

suite("provider send-time writes against real Postgres (#2049)", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
  });
  async function fixture(run: (tdb: TenantDb) => Promise<void>, stored: Date | null = null) {
    const { withAppCurrentUser, createTenantDb } = await import("@/server/tenant-db");
    await withAppCurrentUser(randomUUID(), async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE message (LIKE public.message INCLUDING DEFAULTS) ON COMMIT DROP`);
      const tdb = createTenantDb(workspaceId, tx);
      await tdb.message.insert({ sid, status: "sent", date_sent: stored, date_created: new Date("2026-10-01T00:00:00Z") });
      await run(tdb);
    });
  }

  afterAll(async () => {
    try {
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end(), directPool.end()]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("intent resolution preserves identity despite a null provider client reference (#2551)", async () => {
    const { resolveMessageByClientRef } = await import("@/lib/message-db.server");
    await fixture(async (tdb) => {
      await tdb.message.update({ set: { sid: "pending:staff-a", client_ref: "staff-a" } });
      const row = await resolveMessageByClientRef(workspaceId, "staff-a", { sid: "SM-staff-a", client_ref: null }, { tdb });
      expect(row?.sid).toBe("SM-staff-a");
      expect(row?.client_ref).toBe("staff-a");
      expect((await tdb.message.findFirst())?.client_ref).toBe("staff-a");
    });
  });

  test("captures the actual provider Date rather than request time", async () => {
    const { updateMessageBySid } = await import("@/lib/message-db.server");
    await fixture(async (tdb) => {
      const row = await updateMessageBySid(workspaceId, sid, { date_sent: first }, { tdb });
      expect(row?.date_sent).toEqual(first);
      expect(row?.date_created).toEqual(new Date("2026-10-01T00:00:00Z"));
    });
  });

  test("a later provider time preserves the first saved time", async () => {
    const { updateMessageBySid } = await import("@/lib/message-db.server");
    await fixture(async (tdb) => {
      const row = await updateMessageBySid(workspaceId, sid, { date_sent: later }, { tdb });
      expect(row?.date_sent).toEqual(first);
    }, first);
  });

  test("a null provider time does not clear a saved time", async () => {
    const { updateMessageBySid } = await import("@/lib/message-db.server");
    await fixture(async (tdb) => {
      const row = await updateMessageBySid(workspaceId, sid, { date_sent: null }, { tdb });
      expect(row?.date_sent).toEqual(first);
    }, first);
  });

  test("a status-only write preserves the time and terminal status guard", async () => {
    const { updateMessageBySid } = await import("@/lib/message-db.server");
    await fixture(async (tdb) => {
      await updateMessageBySid(workspaceId, sid, { status: "delivered" }, { tdb });
      const row = await updateMessageBySid(workspaceId, sid, { status: "sent" }, { tdb });
      expect(row?.status).toBe("delivered");
      expect(row?.date_sent).toEqual(first);
    }, first);
  });

  test("a foreign workspace cannot capture or replace the send time", async () => {
    const { updateMessageBySid } = await import("@/lib/message-db.server");
    const { createTenantDb, withAppCurrentUser } = await import("@/server/tenant-db");
    await withAppCurrentUser(randomUUID(), async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE message (LIKE public.message INCLUDING DEFAULTS) ON COMMIT DROP`);
      const own = createTenantDb(workspaceId, tx);
      await own.message.insert({ sid, status: "sent", date_sent: first });
      const foreignId = randomUUID();
      const row = await updateMessageBySid(foreignId, sid, { date_sent: later }, { tdb: createTenantDb(foreignId, tx) });
      expect(row).toBeNull();
      expect((await own.message.findFirst())?.date_sent).toEqual(first);
    });
  });
});

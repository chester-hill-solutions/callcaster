import { afterAll, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspaceId = "11111111-2222-4333-8444-555555555555";
const otherWorkspaceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const to = "+15551234567";

suite("normalized SMS recipient selection against Postgres (#2089)", () => {
  afterAll(async () => {
    const { pool, directPool } = await import("@/server/db");
    await Promise.all([pool.end(), directPool.end()]);
  });

  async function withContacts(run: (tx: Database) => Promise<void>) {
    process.env.DATABASE_URL = databaseUrl;
    const { db } = await import("@/server/db");
    const tenant = await import("@/server/tenant-db");
    const createTenantDb = tenant.createTenantDb;
    await db.transaction(async (transaction) => {
      // Session-local rows preserve the real query and tenant filter without changing app data.
      await transaction.execute(
        sql`create temporary table contact (like public.contact including defaults) on commit drop`,
      );
      const tx = transaction as unknown as Database;
      const spy = vi
        .spyOn(tenant, "createTenantDb")
        .mockImplementation((workspace) => createTenantDb(workspace, tx));
      try {
        await run(tx);
      } finally {
        spy.mockRestore();
      }
    });
  }

  test.each([
    "+1 (555) 123-4567",
    "1 555 123 4567",
    "(555)123-4567",
    "555.123.4567",
    "+15551234567",
  ])(
    "blocks an opted-out row stored as %s, with and without its ID",
    async (phone) => {
      await withContacts(async (tx) => {
        await tx.execute(sql`insert into contact (id, workspace, phone, firstname, opt_out, line_type)
        values (9, ${workspaceId}, ${phone}, 'Ada', true, 'mobile')`);
        const { verifySmsRecipient } =
          await import("@/lib/chat-sms-guards.server");
        for (const id of [undefined, "9"]) {
          expect(await verifySmsRecipient(workspaceId, to, id)).toMatchObject({
            ok: false,
            reason: "opted_out",
          });
        }
      });
    },
  );

  test("finds hidden normalized duplicates despite a canonical exact row", async () => {
    await withContacts(async (tx) => {
      await tx.execute(sql`insert into contact (id, workspace, phone, opt_out, line_type) values
        (9, ${workspaceId}, ${to}, false, 'mobile'),
        (10, ${workspaceId}, '+1 (555) 123-4567', true, 'mobile')`);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      for (const id of [undefined, "9", "10"]) {
        expect(await verifySmsRecipient(workspaceId, to, id)).toMatchObject({
          ok: false,
          reason: "recipient_unverified",
        });
      }
    });
  });

  test("keeps an eligible normalized recipient and excludes another workspace and prefix", async () => {
    await withContacts(async (tx) => {
      await tx.execute(sql`insert into contact (id, workspace, phone, firstname, opt_out, line_type) values
        (9, ${workspaceId}, '+1 (555) 123-4567', 'Ada', false, 'mobile'),
        (10, ${otherWorkspaceId}, ${to}, 'Other', true, 'landline'),
        (11, ${workspaceId}, '+155512345670', 'Prefix', true, 'landline')`);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      for (const id of [undefined, "9"]) {
        expect(await verifySmsRecipient(workspaceId, to, id)).toMatchObject({
          ok: true,
          contact: { id: 9, firstname: "Ada" },
        });
      }
      for (const id of ["10", "11", "999"]) {
        expect(await verifySmsRecipient(workspaceId, to, id)).toMatchObject({
          ok: false,
          reason: "recipient_unverified",
        });
      }
    });
  });

  test("permits a new number only without a supplied contact ID", async () => {
    await withContacts(async (tx) => {
      await tx.execute(sql`insert into contact (id, workspace, phone, opt_out, line_type) values
        (10, ${otherWorkspaceId}, ${to}, true, 'landline'),
        (11, ${workspaceId}, '+155512345670', true, 'landline')`);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(await verifySmsRecipient(workspaceId, to)).toEqual({
        ok: true,
        contact: null,
      });
      expect(await verifySmsRecipient(workspaceId, to, "10")).toMatchObject({
        ok: false,
        reason: "recipient_unverified",
      });
    });
  });

  test("matches international digits without selecting a different country", async () => {
    await withContacts(async (tx) => {
      await tx.execute(sql`insert into contact (id, workspace, phone, opt_out, line_type) values
        (9, ${workspaceId}, '+44 (20) 7946 0958', false, 'mobile'),
        (10, ${workspaceId}, '+1 (207) 946-0958', true, 'landline')`);
      const { verifySmsRecipient } =
        await import("@/lib/chat-sms-guards.server");
      expect(
        await verifySmsRecipient(workspaceId, "+442079460958", "9"),
      ).toMatchObject({ ok: true, contact: { id: 9 } });
    });
  });
});

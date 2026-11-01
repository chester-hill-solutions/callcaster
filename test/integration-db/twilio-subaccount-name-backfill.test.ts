import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildNameBackfillPlan,
  createOwnershipReader,
} from "../../scripts/lib/twilio-subaccount-name-backfill.mjs";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const ids = [randomUUID(), randomUUID(), randomUUID()];
const PARENT = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHILD = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const legacySchema = "backfill_" + randomUUID().replaceAll("-", "");
const marker = "fixture-secret-must-not-leave-query";
let sql: ReturnType<typeof postgres>;

function requiredDatabaseUrl() {
  if (!databaseUrl)
    throw new Error("Owned integration database URL is required");
  return databaseUrl;
}

describe.skipIf(!databaseUrl)(
  "backfill ownership query against PostgreSQL",
  () => {
    beforeAll(async () => {
      sql = postgres(requiredDatabaseUrl(), { max: 1 });
      await sql`create schema ${sql(legacySchema)}`;
      await sql`create table ${sql(legacySchema)}.workspace (id uuid primary key, name text, twilio_data jsonb)`;
      await sql`insert into ${sql(legacySchema)}.workspace values (${ids[0]}, 'Legacy owner', ${sql.json({ sid: CHILD })})`;
      for (const [index, id] of ids.entries()) {
        const credentials =
          index === 0
            ? { sid: CHILD }
            : index === 1
              ? { sid: " ", account_sid: CHILD }
              : { accountSid: CHILD };
        await sql`insert into workspace (id, name, twilio_data) values
        (${id}, 'Owned backfill fixture', ${index === 1 ? JSON.stringify({ ...credentials, authToken: marker }) : sql.json({ ...credentials, authToken: marker })})`;
      }
      await sql`update workspace set archived_at = now() where id = ${ids[1]}`;
    });
    afterAll(async () => {
      if (!sql) return;
      await sql`delete from workspace where id in ${sql(ids)}`;
      await sql`drop schema ${sql(legacySchema)} cascade`;
      await sql.end({ timeout: 5 });
    });

    it("reads exact SIDs across stored key formats without reading credentials", async () => {
      const reader = createOwnershipReader([
        { environment: "dev", url: databaseUrl },
      ]);
      try {
        const [source] = await reader.read();
        const owned = source.workspaces.filter((w: { id: string }) =>
          ids.includes(w.id),
        );
        expect(owned).toHaveLength(3);
        expect(
          owned.map((w: { account_sid: string }) => w.account_sid),
        ).toEqual([CHILD, CHILD, CHILD]);
        expect(Object.keys(owned[0]).sort()).toEqual([
          "account_sid",
          "archive_supported",
          "archived_at",
          "id",
          "name",
        ]);
        expect(JSON.stringify(source)).not.toContain(marker);
        expect(source.identity).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(source)).not.toContain(
          new URL(requiredDatabaseUrl()).hostname,
        );
      } finally {
        await reader.close();
      }
    });

    it("retains archived owners for cross-environment protection", async () => {
      const reader = createOwnershipReader([
        { environment: "production", url: databaseUrl },
      ]);
      try {
        const [source] = await reader.read();
        expect(
          source.workspaces.find((w: { id: string }) => w.id === ids[1])
            .archived_at,
        ).not.toBeNull();
      } finally {
        await reader.close();
      }
    });

    it("reads legacy reference owners without allowing a target rename", async () => {
      const url = new URL(requiredDatabaseUrl());
      url.searchParams.set("options", "-c search_path=" + legacySchema);
      const reader = createOwnershipReader([
        { environment: "qa", url: url.href },
      ]);
      try {
        const [source] = await reader.read();
        expect(source.workspaces).toEqual([
          {
            id: ids[0],
            name: "Legacy owner",
            account_sid: CHILD,
            archived_at: null,
            archive_supported: false,
          },
        ]);
      } finally {
        await reader.close();
      }
    });

    it("identifies the same real database despite different URL options", async () => {
      const alias = new URL(requiredDatabaseUrl());
      alias.searchParams.set("application_name", "owned-backfill-alias");
      const reader = createOwnershipReader([
        { environment: "dev", url: databaseUrl },
        { environment: "qa", url: alias.href },
        { environment: "production", url: databaseUrl },
      ]);
      try {
        const sources = await reader.read();
        expect(
          new Set(sources.map((s: { identity: string }) => s.identity)).size,
        ).toBe(1);
        expect(() =>
          buildNameBackfillPlan({
            environment: "dev",
            sources,
            parent: { sid: PARENT, ownerAccountSid: PARENT },
            accounts: [],
          }),
        ).toThrow("same database");
      } finally {
        await reader.close();
      }
    });
  },
);

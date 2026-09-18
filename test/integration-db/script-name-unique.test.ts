import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createTenantDb } from "@/server/tenant-db";
import { isUniqueViolation } from "@/lib/parse-utils.server";

/**
 * #1704/#1781 — the only automated coverage of the real
 * `script_workspace_name_unique` index. The app maps a 23505 violation to a
 * friendly "already exists" error in three places, but that guard is only
 * REACHABLE if the database actually enforces (workspace, name) uniqueness —
 * which a mocked client can never prove. Insert two same-named scripts in one
 * workspace against a real Postgres and assert the second insert rejects.
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Written straight to stderr on purpose: vitest's console interceptor
  // swallows module-scope `console.warn`, and a skip nobody sees is how an
  // untested constraint gets mistaken for a tested one.
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/script-name-unique.test.ts is the ONLY test that",
      "!! proves the script_workspace_name_unique index exists in a real",
      "!! database. Skipping it means the friendly duplicate-name error is",
      "!! unverified against the schema (#1704).",
      "!!",
      "!! To run it:",
      "!!   docker compose -f docker-compose.dev.yml up -d postgres",
      "!!   export DATABASE_URL=postgresql://callcaster:callcaster@127.0.0.1:5433/callcaster",
      "!!   node scripts/e2e/bootstrap-compose-db.mjs",
      "!!   npm run test:integration-db",
      "!! CI runs it as part of `npm run test:e2e:compose`.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("script name uniqueness (#1704/#1781)", () => {
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle>;
  const workspaceIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL as string, {
      max: 10,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    db = drizzle(client);
  }, 30_000);

  afterAll(async () => {
    if (client) {
      if (workspaceIds.length > 0) {
        // script.workspace cascades from workspace delete.
        await client`delete from public.workspace where id = any(${workspaceIds}::uuid[])`;
      }
      await client.end();
    }
  });

  async function insertScript(workspaceId: string, name: string) {
    const tdb = createTenantDb(workspaceId, db as never);
    const timestamp = new Date().toISOString();
    return tdb.script.insert({
      name,
      type: "simple_ivr",
      steps: { pages: {}, blocks: {} },
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  async function newWorkspace(name: string): Promise<string> {
    const rows = await client<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values (${name}, 100, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    const id = rows[0].id;
    workspaceIds.push(id);
    return id;
  }

  test("inserting a duplicate script name in the same workspace rejects", async () => {
    const ws = await newWorkspace("Integration DB Script Fixture A");

    const first = await insertScript(ws, "Intro");
    expect(first[0].id).toBeGreaterThan(0);

    const duplicate = () => insertScript(ws, "Intro");
    // Drizzle wraps the driver error; isUniqueViolation unwraps the cause
    // chain — the same predicate every friendly "already exists" site uses.
    await expect(duplicate()).rejects.toSatisfy(isUniqueViolation);
  });

  test("the same script name in a different workspace still inserts", async () => {
    const wsA = await newWorkspace("Integration DB Script Fixture B1");
    const wsB = await newWorkspace("Integration DB Script Fixture B2");

    const first = await insertScript(wsA, "Intro");
    const second = await insertScript(wsB, "Intro");
    expect(first[0].id).toBeGreaterThan(0);
    expect(second[0].id).toBeGreaterThan(0);
  });
});
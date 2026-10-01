import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  countExportCampaignMessages,
  listExportCampaignMessages,
} from "@/lib/campaign-export-db.server";
import { createTenantDb } from "@/server/tenant-db";

/**
 * The campaign export's lower bound, against real Postgres.
 *
 * #2213 re-declared `message.date_created` as `timestamptz`. The caller passes
 * `campaign.start_date ?? ""`, so an empty string is a live input. While the
 * column was `text()`, `gte(col, "")` compared lexicographically and was true
 * of every non-empty value, so the bound silently did nothing — which is the
 * behaviour the export actually had.
 *
 * The naive conversion, `new Date("")`, is an Invalid Date: it would turn a
 * no-op into a query that throws or matches nothing. This suite pins the no-op,
 * because the difference is invisible until a campaign has no `start_date` and
 * an export silently returns zero rows.
 */

const DATABASE_URL = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.stderr.write(
    [
      "",
      "!".repeat(72),
      "!! integration-db SKIPPED: no INTEGRATION_DB_URL / DATABASE_URL set.",
      "!!",
      "!! test/integration-db/export-message-date-bounds.test.ts proves the export",
      "!! message date bounds behave against a real timestamptz column.",
      "!".repeat(72),
      "",
    ].join("\n"),
  );
}

const CAMPAIGN = 9_221_301;
const END = "2026-12-31";
const PIVOT = "2026-04-01T00:00:00.000Z";

describe.skipIf(!DATABASE_URL)("export message date bounds against real timestamptz (#2213)", () => {
  let client: ReturnType<typeof postgres> | null = null;
  const workspaceIds: string[] = [];

  /** The suite is skipped above when there is no database, so this cannot be null here. */
  function db(): ReturnType<typeof postgres> {
    if (!client) throw new Error("database client not initialised");
    return client;
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL ?? "", {
      max: 10,
      prepare: false,
      connect_timeout: 10,
      onnotice: () => {},
    });
    // A previous run against the same database would collide on message.sid.
    await db()`delete from public.message where campaign_id = ${CAMPAIGN}`;
    await db()`delete from public.campaign where id = ${CAMPAIGN}`;
  }, 30_000);

  afterAll(async () => {
    if (client) {
      if (workspaceIds.length > 0) {
        await db()`delete from public.message where campaign_id = ${CAMPAIGN}`;
        await db()`delete from public.campaign where id = ${CAMPAIGN}`;
        await db()`delete from public.workspace where id = any(${workspaceIds}::uuid[])`;
      }
      await client.end();
    }
  });

  async function newWorkspace(name: string): Promise<string> {
    const rows = await db()<{ id: string }[]>`
      insert into public.workspace (name, credits, twilio_data, feature_flags, disabled)
      values (${name}, 100, '{}'::jsonb, '{}'::jsonb, false)
      returning id::text as id
    `;
    const created = rows[0];
    if (!created) {
      throw new Error("workspace insert returned no row");
    }
    workspaceIds.push(created.id);
    return created.id;
  }

  /** Two messages either side of PIVOT, so a bound admits both, one, or neither. */
  let seedSeq = 0;
  async function seed(workspaceId: string) {
    seedSeq += 1;
    const tag = `${CAMPAIGN}_${seedSeq}`;
    await db()`
      insert into public.campaign (id, workspace, title)
      values (${CAMPAIGN}, ${workspaceId}::uuid, 'bounds')
      on conflict (id) do nothing
    `;
    const tdb = createTenantDb(workspaceId, drizzle(db()) as never);
    await tdb.message.insertMany([
      {
        workspace: workspaceId,
        campaign_id: CAMPAIGN,
        body: "before",
        sid: `SM_before_${tag}`,
        direction: "outbound-reply",
        date_created: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        workspace: workspaceId,
        campaign_id: CAMPAIGN,
        body: "after",
        sid: `SM_after_${tag}`,
        direction: "outbound-reply",
        date_created: new Date("2026-05-01T00:00:00.000Z"),
      },
    ] as never);
    // Each test has its own workspace, so counting is scoped by the tenant db.
    return tdb;
  }

  test("an empty lower bound is no lower bound at all", async () => {
    const ws = await newWorkspace("export-bounds-empty");
    await seed(ws);

    await expect(
      countExportCampaignMessages(ws, CAMPAIGN, "", END),
    ).resolves.toBe(2);

    const rows = await listExportCampaignMessages(ws, CAMPAIGN, "", END, 0, 10);
    expect(rows.map((row) => row.body).sort()).toEqual(["after", "before"]);
  });

  test("a real lower bound still filters", async () => {
    const ws = await newWorkspace("export-bounds-real");
    await seed(ws);

    await expect(
      countExportCampaignMessages(ws, CAMPAIGN, PIVOT, END),
    ).resolves.toBe(1);

    const rows = await listExportCampaignMessages(ws, CAMPAIGN, PIVOT, END, 0, 10);
    expect(rows.map((row) => row.body)).toEqual(["after"]);
  });

  test("an unparseable lower bound is treated as absent, not as Invalid Date", async () => {
    const ws = await newWorkspace("export-bounds-junk");
    await seed(ws);

    // An Invalid Date here would reject at Postgres and take the whole export
    // down; the previous no-op behaviour is what callers depend on.
    await expect(
      countExportCampaignMessages(ws, CAMPAIGN, "junk", END),
    ).resolves.toBe(2);
  });

  test("a lower bound later than every row filters everything out", async () => {
    const ws = await newWorkspace("export-bounds-future");
    await seed(ws);

    await expect(
      countExportCampaignMessages(ws, CAMPAIGN, "2027-01-01T00:00:00.000Z", END),
    ).resolves.toBe(0);
  });
});
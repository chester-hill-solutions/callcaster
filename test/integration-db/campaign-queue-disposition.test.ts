import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { campaign_queue } from "@/db/schema";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const workspace = "a0000000-0000-4000-8000-000000000001";
const foreignWorkspace = "a0000000-0000-4000-8000-000000000002";

suite("campaign queue disposition scope against Postgres (#2402)", () => {
  let client: ReturnType<typeof postgres>;
  let buildWhere: typeof import("@/lib/campaign-queue-search.server").buildCampaignQueueSearchWhere;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("A database URL is required for these cases");
    client = postgres(databaseUrl, { max: 1, prepare: false });
    await client`select 1`;
    const originalUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = databaseUrl;
      ({ buildCampaignQueueSearchWhere: buildWhere } = await import("@/lib/campaign-queue-search.server"));
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
    if (buildWhere) {
      const { pool, directPool } = await import("@/server/db");
      await Promise.all([pool.end({ timeout: 5 }), directPool.end({ timeout: 5 })]);
    }
  });

  type Attempt = {
    campaign?: number;
    contact?: number;
    workspace?: string;
    disposition: string | null;
  };

  async function find(
    attempts: Attempt[],
    disposition: string,
    options: { workspaceFilter?: boolean; queueStatus?: string; queueState?: string } = {},
  ) {
    return client.begin(async (tx) => {
      await tx`create temporary table campaign_queue (
        id integer, campaign_id integer, contact_id integer, workspace text,
        queue_state text, dequeued_at timestamptz, provider_status text
      ) on commit drop`;
      await tx`create temporary table outreach_attempt (
        id integer, campaign_id integer, contact_id integer, workspace text,
        disposition text
      ) on commit drop`;
      await tx`insert into campaign_queue (id, campaign_id, contact_id, workspace, queue_state)
        values (71, 41, 9, ${workspace}, ${options.queueState ?? "queued"})`;
      for (const [index, attempt] of attempts.entries()) {
        await tx`insert into outreach_attempt values (
          ${81 + index}, ${attempt.campaign ?? 41}, ${attempt.contact ?? 9},
          ${attempt.workspace ?? workspace}, ${attempt.disposition}
        )`;
      }
      const filters: QueueSearchFilters = {
        name: "", phone: "", email: "", address: "", audiences: "",
        disposition, queueStatus: options.queueStatus ?? "",
      };
      // Compile with the supported client; execute where the temporary rows live.
      const statement = drizzle(client).select({ id: campaign_queue.id })
        .from(campaign_queue)
        .where(buildWhere(41, filters, "", options.workspaceFilter === false ? undefined : workspace))
        .toSQL();
      return tx.unsafe(statement.sql, statement.params);
    });
  }

  test.each([
    { filter: "failed", disposition: "failed" },
    { filter: "unknown", disposition: null },
  ])("$filter excludes another campaign for the same contact", async ({ filter, disposition }) => {
    expect(await find([{ campaign: 42, disposition }], filter)).toEqual([]);
  });

  test.each([
    { filter: "failed", disposition: "failed" },
    { filter: "unknown", disposition: null },
  ])("$filter excludes another workspace for the same campaign and contact", async ({ filter, disposition }) => {
    expect(await find([{ workspace: foreignWorkspace, disposition }], filter)).toEqual([]);
  });

  test.each([
    { filter: "failed", disposition: "failed" },
    { filter: "unknown", disposition: null },
  ])("$filter excludes another contact in the same campaign", async ({ filter, disposition }) => {
    expect(await find([{ contact: 10, disposition }], filter)).toEqual([]);
  });

  test.each([
    { filter: "failed", disposition: "failed" },
    { filter: "unknown", disposition: null },
  ])("$filter retains a matching campaign, workspace and contact", async ({ filter, disposition }) => {
    expect(await find([{ disposition }], filter)).toEqual([{ id: 71 }]);
  });

  test.each([
    { filter: "failed", disposition: "failed" },
    { filter: "unknown", disposition: null },
  ])("$filter retains workspace correlation without an outer workspace argument", async ({ filter, disposition }) => {
    expect(await find([{ workspace: foreignWorkspace, disposition }], filter, { workspaceFilter: false })).toEqual([]);
    expect(await find([{ disposition }], filter, { workspaceFilter: false })).toEqual([{ id: 71 }]);
  });

  test("an unfiltered queue does not require a matching attempt", async () => {
    expect(await find([], "")).toEqual([{ id: 71 }]);
    expect(await find([{ campaign: 42, disposition: "failed" }], "")).toEqual([{ id: 71 }]);
  });

  test("a later attempt does not hide an earlier matching result", async () => {
    expect(await find([{ disposition: "failed" }, { disposition: "completed" }], "failed")).toEqual([{ id: 71 }]);
  });

  test("a matching result still requires the requested queue status", async () => {
    expect(await find([{ disposition: "failed" }], "failed", { queueStatus: "assigned", queueState: "assigned" })).toEqual([{ id: 71 }]);
  });

  test("a matching result does not override a different queue status", async () => {
    expect(await find([{ disposition: "failed" }], "failed", { queueStatus: "assigned" })).toEqual([]);
  });
});

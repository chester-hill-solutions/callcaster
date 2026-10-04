import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { sql } from "drizzle-orm";

const notifications = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/low-credit-notify.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/low-credit-notify.server")>()),
  runLowCreditNotify: notifications.run,
}));
vi.mock("@/lib/platform-idempotency.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform-idempotency.server")>()),
  pruneExpiredIdempotencyRecords: async () => 0,
}));
vi.mock("@/lib/worker/job-retention.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/worker/job-retention.server")>()),
  pruneCompletedJobs: async () => 0,
  pruneWorkspaceEvents: async () => 0,
}));

const databaseUrl = process.env.INTEGRATION_DB_URL;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousDirectUrl = process.env.DATABASE_DIRECT_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) process.stderr.write("Rate retention proof skipped: INTEGRATION_DB_URL is required.\n");

suite("daily public rate-limit retention (#2329)", () => {
  const schemaName = `rate_retention_${randomUUID().replaceAll("-", "")}`;
  let fixture: postgres.Sql;
  let client: postgres.Sql;
  let database: typeof import("@/server/db").db;
  let prune: typeof import("@/lib/platform-rate-limit-db.server").pruneExpiredRateLimitBuckets;
  let check: typeof import("@/lib/platform-rate-limit-db.server").checkRateLimitPostgres;
  let handler: typeof import("@/lib/worker/handlers/cron.server").lowCreditNotifyHandler;
  let logger: typeof import("@/lib/logger.server").logger;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Missing isolated test database URL");
    fixture = postgres(databaseUrl, { max: 2 });
    await fixture.unsafe(`create schema "${schemaName}"`);
    // Run the actual bucket DDL and RPC, with only their namespace isolated.
    const migration = await readFile(new URL("../../client/migrations/20260714120000_rate_limit_bucket.sql", import.meta.url), "utf8");
    await fixture.unsafe(migration.replaceAll("public.", `"${schemaName}".`));
    await fixture.unsafe(`create table "${schemaName}".job (like public.job including all)`);
    await fixture.unsafe(`create sequence "${schemaName}".job_id_seq owned by "${schemaName}".job.id`);
    await fixture.unsafe(`alter table "${schemaName}".job alter column id set default nextval('"${schemaName}".job_id_seq')`);
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set("search_path", `${schemaName},public`);
    scopedUrl.searchParams.set("application_name", schemaName);
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.DATABASE_DIRECT_URL = scopedUrl.toString();
    ({ db: database, pool: client } = await import("@/server/db"));
    ({ pruneExpiredRateLimitBuckets: prune, checkRateLimitPostgres: check } = await import("@/lib/platform-rate-limit-db.server"));
    ({ lowCreditNotifyHandler: handler } = await import("@/lib/worker/handlers/cron.server"));
    ({ logger } = await import("@/lib/logger.server"));
    await fixture`insert into public.rate_limit_bucket (key, count, reset_at)
      values (${schemaName}, 9, now() - interval '2 days')`;
    await fixture.unsafe(`create function "${schemaName}".reject_prune() returns trigger language plpgsql as $$
      begin raise exception 'controlled rate-limit cleanup failure'; end $$`);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    notifications.run.mockReset().mockResolvedValue({ ok: true, checked: 3, notified: 1, cleared: 0, skippedNoRecipients: 0 });
    await client`delete from rate_limit_bucket`;
    await client`delete from job`;
  });

  afterEach(async () => {
    const [control] = await fixture`select count from public.rate_limit_bucket where key = ${schemaName}`;
    expect(control).toEqual({ count: 9 });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DATABASE_DIRECT_URL;
    else process.env.DATABASE_DIRECT_URL = previousDirectUrl;
    try {
      if (client) {
        const { directPool } = await import("@/server/db");
        await Promise.all([client.end(), directPool.end()]);
      }
      if (fixture) {
        await fixture`delete from public.rate_limit_bucket where key = ${schemaName}`;
        await fixture.unsafe(`drop schema if exists "${schemaName}" cascade`);
      }
    } finally {
      if (fixture) await fixture.end();
    }
  });

  test("keeps the exact boundary, recent-expired and live counters while removing old rows", async () => {
    await database.transaction(async (tx) => {
      await tx.execute(sql`insert into rate_limit_bucket (key, count, reset_at) values
        ('old', 7, now() - interval '24 hours 1 microsecond'),
        ('boundary', 3, now() - interval '24 hours'),
        ('recent', 5, now() - interval '1 hour'),
        ('live', 2, now() + interval '1 hour')`);
      const execute = vi.spyOn(database, "execute").mockImplementation((query) => tx.execute(query));
      try {
        expect(await prune()).toBe(1);
        const rows = await tx.execute<{ key: string; count: number }>(sql`select key, count from rate_limit_bucket order by key`);
        expect([...rows]).toEqual([{ key: "boundary", count: 3 }, { key: "live", count: 2 }, { key: "recent", count: 5 }]);
        expect(await prune()).toBe(0);
        expect(await check({ key: "live", limit: 3, windowMs: 60_000 })).toMatchObject({ ok: true, remaining: 0 });
        expect(await check({ key: "live", limit: 3, windowMs: 60_000 })).toMatchObject({ ok: false });
      } finally {
        execute.mockRestore();
      }
    });
  });

  test("clears a backlog larger than one batch and returns only aggregate counts", async () => {
    await client`insert into rate_limit_bucket (key, reset_at)
      select 'old-' || n, now() - interval '2 days' from generate_series(1, 2105) n`;
    const execute = vi.spyOn(database, "execute");
    expect(await prune()).toBe(2105);
    expect(await client`select key from rate_limit_bucket`).toHaveLength(0);
    expect(execute.mock.calls.length).toBeGreaterThan(1);
    for (const result of execute.mock.results) {
      const rows = await result.value;
      expect([...rows]).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(["candidates", "pruned"]);
    }
  });

  test("does not delete a bucket reactivated while cleanup waits for its row lock", async () => {
    await client`insert into rate_limit_bucket (key, count, reset_at) values ('reactivated', 1, now() - interval '2 days')`;
    let pruning: Promise<number> | undefined;
    await fixture.begin(async (tx) => {
      await tx.unsafe(`update "${schemaName}".rate_limit_bucket set count = 4, reset_at = now() + interval '1 hour' where key = 'reactivated'`);
      pruning = prune();
      await vi.waitFor(async () => {
        const [waiting] = await fixture`select count(*)::integer as count from pg_stat_activity
          where application_name = ${schemaName} and wait_event_type = 'Lock'`;
        expect(waiting.count).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });
    expect(await pruning).toBe(0);
    expect(await client`select key, count from rate_limit_bucket`).toMatchObject([{ key: "reactivated", count: 4 }]);
  });

  test.each(["removed", "empty", "failure"])("daily handler logs %s cleanup and stores its next run", async (state) => {
    const info = vi.spyOn(logger, "info");
    const error = vi.spyOn(logger, "error");
    const [job] = await client<{ id: number }[]>`insert into job (type, status) values ('low_credit_notify', 'running') returning id`;
    if (state === "removed") await client`insert into rate_limit_bucket (key, reset_at) values ('old', now() - interval '2 days')`;
    if (state === "failure") {
      await client`insert into rate_limit_bucket (key, reset_at) values ('failing', now() - interval '2 days')`;
      await fixture.unsafe(`create trigger reject_prune before delete on "${schemaName}".rate_limit_bucket
        for each row execute function "${schemaName}".reject_prune()`);
    }
    const before = Date.now();
    try {
      expect(await handler({ id: job.id, type: "low_credit_notify", params: {}, workspace_id: null, user_id: null, attempt_count: 1, max_attempts: 3 }))
        .toMatchObject({ ok: true, checked: 3, notified: 1 });
      const successors = await client<{ id: number; retry_at: Date }[]>`select id, retry_at from job where type = 'low_credit_notify' and status = 'queued'`;
      expect(successors).toHaveLength(1);
      expect(successors[0].id).not.toBe(job.id);
      expect(new Date(successors[0].retry_at).getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(new Date(successors[0].retry_at).getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
      if (state === "failure") {
        expect(error).toHaveBeenCalledWith("worker.maintenance.rate_limit_bucket_prune_failed", expect.objectContaining({ error: expect.stringContaining("rate_limit_bucket") }));
        expect(await client`select key from rate_limit_bucket`).toEqual([expect.objectContaining({ key: "failing" })]);
        expect(info).not.toHaveBeenCalledWith("worker.maintenance.rate_limit_buckets_pruned", expect.anything());
      } else {
        expect(info).toHaveBeenCalledWith("worker.maintenance.rate_limit_buckets_pruned", { pruned: state === "removed" ? 1 : 0 });
        expect(await client`select key from rate_limit_bucket`).toHaveLength(0);
      }
    } finally {
      if (state === "failure") await fixture.unsafe(`drop trigger reject_prune on "${schemaName}".rate_limit_bucket`);
    }
  });
});

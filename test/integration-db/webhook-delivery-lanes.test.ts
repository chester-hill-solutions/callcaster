import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/safe-outbound-url.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safe-outbound-url.server")>()),
  safeOutboundFetch: (...args: unknown[]) => transport.fetch(...args),
}));

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousDirectUrl = process.env.DATABASE_DIRECT_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) process.stderr.write("Webhook lane proof skipped: INTEGRATION_DB_URL is required.\n");

suite("durable webhook delivery has reserved worker capacity (#2117)", () => {
  let client: postgres.Sql;
  let fixture: postgres.Sql;
  const schemaName = `webhook_lane_${randomUUID().replaceAll("-", "")}`;
  let workspaceId: string;
  let publicJobId: number;
  let enqueue: typeof import("@/lib/worker/job-params.server").enqueueRegisteredJob;
  let runLanes: typeof import("@/lib/worker/run-worker.server").runWorkerJobLanes;
  let deliver: typeof import("@/lib/worker/handlers/campaign.server").webhookDeliveryHandler;
  let parseParams: typeof import("@/lib/worker/job-params.server").webhookDeliveryParams;
  let claim: typeof import("@/lib/worker/poll-jobs.server").claimNextJob;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Missing isolated test database URL");
    fixture = postgres(databaseUrl, { max: 1 });
    await fixture.unsafe(`create schema "${schemaName}"`);
    await fixture.unsafe(`create table "${schemaName}".job (like public.job including all)`);
    await fixture.unsafe(`create sequence "${schemaName}".job_id_seq owned by "${schemaName}".job.id`);
    await fixture.unsafe(`alter table "${schemaName}".job alter column id set default nextval('"${schemaName}".job_id_seq')`);
    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set("search_path", `${schemaName},public`);
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.DATABASE_DIRECT_URL = scopedUrl.toString();
    ({ pool: client } = await import("@/server/db"));
    ({ enqueueRegisteredJob: enqueue, webhookDeliveryParams: parseParams } = await import("@/lib/worker/job-params.server"));
    ({ runWorkerJobLanes: runLanes } = await import("@/lib/worker/run-worker.server"));
    ({ webhookDeliveryHandler: deliver } = await import("@/lib/worker/handlers/campaign.server"));
    ({ claimNextJob: claim } = await import("@/lib/worker/poll-jobs.server"));
    const [row] = await client<{ id: string }[]>`insert into workspace (name, credits, twilio_data, feature_flags, disabled)
      values ('Webhook worker proof', 100, '{}'::jsonb, '{}'::jsonb, false) returning id::text`;
    workspaceId = row.id;
    const [publicJob] = await fixture<{ id: number }[]>`insert into public.job (type, workspace_id)
      values ('general_probe', ${workspaceId}::uuid) returning id`;
    publicJobId = publicJob.id;
  });

  afterEach(async () => {
    if (!fixture || !publicJobId) return;
    const [control] = await fixture`select status, attempt_count from public.job where id = ${publicJobId}`;
    expect(control).toMatchObject({ status: "queued", attempt_count: 0 });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    transport.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    await client`delete from job where workspace_id = ${workspaceId}::uuid`;
    await client`delete from webhook where workspace = ${workspaceId}::uuid`;
    await client`insert into webhook (workspace, destination_url, events)
      values (${workspaceId}::uuid, 'https://integration.example/status',
        '[{"category":"outbound_sms","type":"UPDATE"}]'::jsonb)`;
  });

  afterAll(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DATABASE_DIRECT_URL;
    else process.env.DATABASE_DIRECT_URL = previousDirectUrl;
    try {
      if (workspaceId) {
        await fixture`delete from public.job where workspace_id = ${workspaceId}::uuid`;
        await fixture`delete from public.webhook where workspace = ${workspaceId}::uuid`;
        await fixture`delete from public.workspace where id = ${workspaceId}::uuid`;
      }
    } finally {
      try {
        if (client) {
          const { directPool } = await import("@/server/db");
          await Promise.all([client.end(), directPool.end()]);
        }
        if (fixture) await fixture.unsafe(`drop schema if exists "${schemaName}" cascade`);
      } finally {
        if (fixture) await fixture.end();
      }
    }
  });

  async function queueStatus(sid: string, status: string) {
    return enqueue({
      type: "webhook_delivery", workspaceId,
      dedupe: { kind: "idempotency", key: `outbound_sms:${sid}:${status}` },
      params: { workspaceId, eventCategory: "outbound_sms", eventType: "UPDATE", optional: true,
        payload: { type: "outbound_sms", record: { message_sid: sid, status }, old_record: { message_sid: sid } } },
    });
  }

  async function stored(id: number) {
    const [row] = await client<{ status: string; attempt_count: number; retry_at: Date | null; error_message: string | null }[]>`
      select status, attempt_count, retry_at, error_message from job where id = ${id}`;
    return row;
  }

  function start(controller: AbortController, general = async () => ({ ok: true })) {
    return runLanes(controller.signal, {
      webhook_delivery: (job) => deliver(job, parseParams.parse(job.params)),
      general_probe: general,
    }, { pollIntervalMs: 5, heartbeatIntervalMs: 20 });
  }

  test("duplicate status enqueue is suppressed while a later status stays deliverable", async () => {
    const first = await queueStatus("SM-proof", "sent");
    const duplicate = await queueStatus("SM-proof", "sent");
    const later = await queueStatus("SM-proof", "delivered");
    expect(first.enqueued).toBe(true);
    expect(duplicate.deduped).toBe(true);
    expect(later.enqueued).toBe(true);
    expect(later.jobId).not.toBe(first.jobId);
    const rows = await client<{ status: string }[]>`select params->'payload'->'record'->>'status' as status
      from job where workspace_id = ${workspaceId}::uuid order by id`;
    expect(rows.map((row) => row.status)).toEqual(["sent", "delivered"]);
  });

  test("claim filters reserve general work and limit delivery to webhook jobs", async () => {
    const [general] = await client<{ id: number }[]>`insert into job (type, workspace_id, created_at)
      values ('general_probe', ${workspaceId}::uuid, '2000-01-01T00:00:00Z') returning id`;
    const delivery = await queueStatus("SM-filter", "sent");
    expect(await claim("delivery-proof", 5, { include: "webhook_delivery" }))
      .toMatchObject({ id: delivery.jobId, type: "webhook_delivery" });
    expect(await claim("general-proof", 5, { exclude: "webhook_delivery" }))
      .toMatchObject({ id: general.id, type: "general_probe" });
  });

  test("a failed destination records a retry and later completes on the second attempt", async () => {
    transport.fetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" });
    const queued = await queueStatus("SM-retry", "delivered");
    if (!queued.jobId) throw new Error("Delivery was not queued");
    const id = queued.jobId;
    const controller = new AbortController();
    const loop = start(controller);
    try {
      await vi.waitFor(async () => expect(await stored(id)).toMatchObject({ status: "queued", attempt_count: 1 }), { timeout: 3000 });
      const failed = await stored(id);
      expect(failed.error_message).toContain("503");
      if (!failed.retry_at) throw new Error("Retry was not scheduled");
      expect(new Date(failed.retry_at).getTime()).toBeGreaterThan(Date.now());
      await client`update job set retry_at = now() - interval '1 second' where id = ${id}`;
      await vi.waitFor(async () => expect(await stored(id)).toMatchObject({ status: "completed", attempt_count: 2 }), { timeout: 3000 });
      expect(transport.fetch).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
      await loop;
    }
  });

  test("a saturated slow delivery lane still lets general jobs complete", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    transport.fetch.mockImplementation(async () => { await held; return { ok: true, status: 200, statusText: "OK" }; });
    const first = await queueStatus("SM-slow-first", "sent");
    const second = await queueStatus("SM-slow-second", "sent");
    if (!first.jobId || !second.jobId) throw new Error("Delivery was not queued");
    const secondId = second.jobId;
    const controller = new AbortController();
    const loop = start(controller);
    try {
      await vi.waitFor(() => expect(transport.fetch).toHaveBeenCalledTimes(1), { timeout: 3000 });
      const [general] = await client<{ id: number }[]>`insert into job (type, workspace_id) values ('general_probe', ${workspaceId}::uuid) returning id`;
      await vi.waitFor(async () => expect(await stored(general.id)).toMatchObject({ status: "completed", attempt_count: 1 }), { timeout: 3000 });
      expect(await stored(first.jobId)).toMatchObject({ status: "running", attempt_count: 1 });
      expect(await stored(second.jobId)).toMatchObject({ status: "queued", attempt_count: 0 });
      expect(transport.fetch).toHaveBeenCalledTimes(1);
      release();
      await vi.waitFor(async () => expect(await stored(secondId)).toMatchObject({ status: "completed", attempt_count: 1 }), { timeout: 3000 });
    } finally {
      release();
      controller.abort();
      await loop;
    }
  });

  test.each(["missing", "disabled"])("an optional %s subscription completes without a customer POST", async (state) => {
    if (state === "missing") await client`delete from webhook where workspace = ${workspaceId}::uuid`;
    else await client`update webhook set events = '[]'::jsonb where workspace = ${workspaceId}::uuid`;
    const queued = await queueStatus("SM-optional", "sent");
    if (!queued.jobId) throw new Error("Delivery was not queued");
    const id = queued.jobId;
    const controller = new AbortController();
    const loop = start(controller);
    try {
      await vi.waitFor(async () => expect(await stored(id)).toMatchObject({ status: "completed", attempt_count: 1 }), { timeout: 3000 });
      expect(transport.fetch).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      await loop;
    }
  });
});

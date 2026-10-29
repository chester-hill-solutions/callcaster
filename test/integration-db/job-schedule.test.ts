import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const databaseUrl = process.env.INTEGRATION_DB_URL ?? process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const marker = "outbound_pacing_probe_3007";

suite("worker wake scheduling against real Postgres (#3007)", () => {
  let client: ReturnType<typeof postgres>;
  let nextDelay: typeof import("@/lib/worker/poll-jobs.server").nextJobPollDelayMs;

  async function cleanup() {
    await client`DELETE FROM job WHERE params->>'probe' = ${marker}`;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Integration database URL is required");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_DIRECT_URL", databaseUrl);
    client = postgres(databaseUrl, { max: 1 });
    nextDelay = (await import("@/lib/worker/poll-jobs.server")).nextJobPollDelayMs;
  });
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await client.end({ timeout: 5 });
    vi.unstubAllEnvs();
  });

  async function addJob(type: string, delayMs: number | null, status = "queued", attempts = 0) {
    await client`
      INSERT INTO job (type, status, params, retry_at, attempt_count, max_attempts)
      VALUES (${type}, ${status}, ${client.json({ probe: marker })},
        now() + ${delayMs} * interval '1 millisecond', ${attempts}, 3)
    `;
  }

  test("an empty lane retains its normal idle poll instead of spinning", async () => {
    expect(await nextDelay(5000, { include: marker })).toBe(5000);
  });

  test("a distant successor cannot extend the normal idle poll", async () => {
    await addJob(marker, 30_000);
    expect(await nextDelay(5000, { include: marker })).toBe(5000);
  });

  test("chooses the next eligible future job in the same lane", async () => {
    await addJob(marker, 4000);
    await addJob("webhook_delivery", 1000);
    await addJob(marker, 500, "queued", 3);
    await addJob(marker, 500, "running");
    await addJob(marker, -1000);
    const delay = await nextDelay(5000, { include: marker });
    expect(delay).toBeGreaterThan(3000);
    expect(delay).toBeLessThanOrEqual(4000);
  });

  test("the webhook and background lanes do not wake for each other's jobs", async () => {
    await addJob("webhook_delivery", 2000);
    await addJob(marker, 4000);
    const webhookDelay = await nextDelay(5000, { include: "webhook_delivery" });
    const backgroundDelay = await nextDelay(5000, { exclude: "webhook_delivery" });
    expect(webhookDelay).toBeGreaterThan(1000);
    expect(webhookDelay).toBeLessThanOrEqual(2000);
    expect(backgroundDelay).toBeGreaterThan(3000);
    expect(backgroundDelay).toBeLessThanOrEqual(4000);
  });

  test("due, running and exhausted rows cannot create a rapid idle loop", async () => {
    await addJob(marker, -1000);
    await addJob(marker, null);
    await addJob(marker, 2000, "running");
    await addJob(marker, 2000, "queued", 3);
    expect(await nextDelay(5000, { include: marker })).toBe(5000);
  });
});

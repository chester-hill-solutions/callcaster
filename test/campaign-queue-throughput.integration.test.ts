import { describe, expect, test } from "vitest";

/**
 * Documents the SQL integration harness for queue throughput RPCs.
 * Execute against local Postgres:
 *   psql "$DATABASE_URL" -f client/tests/campaign_queue_throughput.sql
 */
describe("campaign queue throughput SQL harness", () => {
  test("harness file exists for claim/requeue/fail/complete RPCs", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const sql = await readFile(
      resolve(process.cwd(), "client/tests/campaign_queue_throughput.sql"),
      "utf8",
    );

    expect(sql).toContain("claim_campaign_queue_contacts");
    expect(sql).toContain("requeue_campaign_queue_contact");
    expect(sql).toContain("fail_exhausted_campaign_queue_contacts");
    expect(sql).toContain("reset_stale_campaign_queue_claims");
    expect(sql).toContain("campaign_queue_has_pending_work");
    expect(sql).toContain("try_complete_campaign_if_drained");
    expect(sql).toContain("rollback");
  });
});

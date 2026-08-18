import { describe, expect, test } from "vitest";

/**
 * Documents + guards the SQL fixed by
 * client/migrations/20260805120000_atomic_manual_dial_claims.sql.
 *
 * Both functions were manually verified against a live Postgres 18
 * instance (docker-compose.dev.yml) during review:
 *   - select_and_update_campaign_contacts: two concurrent calls with
 *     limit 3 against a 100-row unclaimed queue landed on disjoint rows
 *     (0 overlap, 6 distinct contacts claimed) instead of the pre-fix
 *     behavior where two agents could receive the same contacts.
 *   - claim_queue_entry_for_dial: claimed once, refused a second agent
 *     ('claimed_by_other'), allowed the same agent to re-claim (idempotent
 *     redial), refused a wrong campaign/workspace ('unavailable'), and
 *     refused while the contact had a live call on the campaign
 *     ('active_call').
 *
 * This repo has no automated live-Postgres test tier (see
 * campaign-queue-throughput.integration.test.ts for the established
 * pattern), so this guards the properties that made those two bugs real —
 * an accidental revert of FOR UPDATE, SKIP LOCKED, or the lock-bound LIMIT
 * would reintroduce a duplicate-dial or queue-wide-serialization bug
 * without any other automated test catching it.
 */
describe("atomic manual-dial-claims SQL harness", () => {
  test("select_and_update_campaign_contacts locks a bounded, ordered candidate set", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const sql = await readFile(
      resolve(
        process.cwd(),
        "client/migrations/20260805120000_atomic_manual_dial_claims.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.select_and_update_campaign_contacts");
    expect(sql).toContain("FOR UPDATE OF cq SKIP LOCKED");
    // The lock must be bounded (ORDER BY + LIMIT) rather than covering every
    // unclaimed row in the campaign — an unbounded lock serializes every
    // concurrent "Save and Next" on one campaign (verified live; see header).
    expect(sql).toMatch(/ORDER BY cq\.attempts[\s\S]*?LIMIT[\s\S]*?FOR UPDATE OF cq SKIP LOCKED/);
    // Re-check inside the UPDATE predicate, not just the lock (belt-and-braces).
    expect(sql).toContain("AND (cq.queue_state IS NULL OR cq.queue_state = 'queued')");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_queue_entry_for_dial");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    for (const code of ["claimed", "unavailable", "claimed_by_other", "not_queued", "active_call"]) {
      expect(sql).toContain(`'${code}'`);
    }
    // The active-call guard must compare the enum by casting to text, not by
    // COALESCE-ing it with a string literal — that failed type resolution
    // against a live call_status enum column (verified live; see header).
    expect(sql).toContain("c.status::text IN");
    expect(sql).not.toMatch(/COALESCE\(c\.status/);
  });
});

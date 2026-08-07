import { describe, expect, test } from "vitest";

/**
 * Documents + guards the SQL fixed by
 * client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql.
 *
 * Both functions manually verified against a live Postgres 18 instance
 * (docker-compose.dev.yml) during review:
 *   - dequeue_contact: with a queue row seeded in workspace 2, calling
 *     dequeue_contact(9102, false, workspace1_uuid, ...) — a workspace-1
 *     caller passing workspace 2's contact_id — left workspace 2's row
 *     completely untouched (queue_state and dequeued_at both stayed null).
 *     The same call with the matching workspace correctly dequeued it.
 *   - create_outreach_attempt: with a queue row seeded in workspace 2,
 *     calling create_outreach_attempt(..., wks_id: workspace1_uuid,
 *     queue_id: 9102) — attributing the outreach_attempt to workspace 1
 *     while pointing queue_id at workspace 2's row — created the
 *     outreach_attempt (correctly tagged to workspace 1) but left workspace
 *     2's campaign_queue.attempts at 0. The same call with a same-workspace
 *     queue_id correctly bumped attempts.
 *
 * This repo has no automated live-Postgres test tier (see
 * campaign-queue-throughput.integration.test.ts for the established
 * pattern), so this guards the property that made the bug real — an
 * accidental revert of either workspace predicate would reintroduce a
 * cross-tenant write without any other automated test catching it.
 */
describe("scope dequeue_contact / create_outreach_attempt by workspace SQL harness", () => {
  test("dequeue_contact filters every write (and the household lookup) by workspace", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const sql = await readFile(
      resolve(
        process.cwd(),
        "client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.dequeue_contact(");
    expect(sql).toContain("p_workspace uuid");
    // The non-household UPDATE.
    expect(sql).toMatch(
      /where contact_id = passed_contact_id\s*\n\s*and workspace = p_workspace/,
    );
    // The household UPDATE: both joined contacts AND the queue row itself
    // must be workspace-checked, not just one side of the join.
    expect(sql).toContain("c1.workspace = p_workspace");
    expect(sql).toContain("c2.workspace = p_workspace");
    expect(sql).toContain("cq.workspace = p_workspace");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_outreach_attempt(");
    expect(sql).toMatch(
      /UPDATE campaign_queue\s*\n\s*SET attempts = attempts \+ 1\s*\n\s*WHERE id = queue_id\s*\n\s*AND workspace = wks_id/,
    );
  });
});

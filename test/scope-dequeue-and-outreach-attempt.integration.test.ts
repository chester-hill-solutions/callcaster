import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
 * This guards the property that made the bug real — an accidental revert of
 * either workspace predicate would reintroduce a cross-tenant write. The
 * dequeue_contact half is now ALSO checked at runtime by
 * test/integration-db/dequeue-contact-assigned.test.ts, which calls the real
 * function against a real Postgres; that test is the authority on which rows
 * the function touches, since asserting on SQL text cannot tell a correct
 * predicate from a broken one (see #1260).
 *
 * Note that 20260807120000 is no longer the CURRENT definition of
 * dequeue_contact — 20260815120000 replaced it, then 20260815130000 (#1278)
 * replaced that. The assertions below run against EVERY migration that defines
 * the function, discovered by scanning the lineage rather than listed by hand:
 * a redefinition that quietly dropped a workspace predicate is exactly what
 * this guards, and a hand-maintained list would have let the next one skip it.
 */
const MIGRATIONS_DIR = "client/migrations";

/**
 * Migrations that (re)define dequeue_contact, from the one that introduced
 * workspace scoping onward. Earlier definitions predate `p_workspace` — that
 * is the bug — so they are excluded by version, not by omission from a list
 * someone has to remember to extend.
 */
const WORKSPACE_SCOPING_MIGRATION =
  `${MIGRATIONS_DIR}/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql`;

const DEQUEUE_CONTACT_DEFINITIONS = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => `${MIGRATIONS_DIR}/${file}`)
  .sort()
  .filter(
    (path) =>
      path >= WORKSPACE_SCOPING_MIGRATION &&
      readFileSync(resolve(process.cwd(), path), "utf8").includes(
        "CREATE OR REPLACE FUNCTION public.dequeue_contact(",
      ),
  );

/** What actually runs: the last definition in the lineage. */
const CURRENT_DEQUEUE_CONTACT_DEFINITION =
  DEQUEUE_CONTACT_DEFINITIONS[DEQUEUE_CONTACT_DEFINITIONS.length - 1];

describe("scope dequeue_contact / create_outreach_attempt by workspace SQL harness", () => {
  test.each(DEQUEUE_CONTACT_DEFINITIONS)(
    "%s: dequeue_contact filters every write (and the household lookup) by workspace",
    async (migration) => {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const sql = await readFile(resolve(process.cwd(), migration), "utf8");

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
    },
  );

  test("the lineage scan found every definition, not an empty list", () => {
    // A filter that silently matched nothing would make the guard above pass
    // vacuously — the failure mode the hand-maintained list had.
    expect(DEQUEUE_CONTACT_DEFINITIONS).toContain(WORKSPACE_SCOPING_MIGRATION);
    expect(DEQUEUE_CONTACT_DEFINITIONS.length).toBeGreaterThanOrEqual(3);
  });

  test("the current definition still reports its rows affected (#1278)", () => {
    // POST /api/queues answers 409 when the primary row was not dequeued, so
    // a later redefinition that went back to `RETURNS void` — only possible
    // via DROP + CREATE — would turn every manual dequeue into a no-op the
    // API cannot see. Runtime coverage lives in
    // test/integration-db/dequeue-contact-assigned.test.ts.
    const sql = readFileSync(
      resolve(process.cwd(), CURRENT_DEQUEUE_CONTACT_DEFINITION),
      "utf8",
    );

    expect(sql).toMatch(/RETURNS integer/i);
    expect(sql).toMatch(/get diagnostics\s+\w+\s*=\s*row_count/i);
    // Only the PRIMARY update's count: the fan-out's own no-ops are the guard
    // working, not a failure.
    expect(sql).toMatch(
      /get diagnostics[\s\S]*?\n\s*if group_on_household then/i,
    );
  });

  test("create_outreach_attempt scopes the attempts-counter UPDATE by workspace", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const sql = await readFile(
      resolve(
        process.cwd(),
        "client/migrations/20260807120000_scope_dequeue_and_outreach_attempt_by_workspace.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_outreach_attempt(");
    expect(sql).toMatch(
      /UPDATE campaign_queue\s*\n\s*SET attempts = attempts \+ 1\s*\n\s*WHERE id = queue_id\s*\n\s*AND workspace = wks_id/,
    );
  });
});

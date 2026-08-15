import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { QUEUE_ENTRY_TRANSITIONS } from "@/lib/queue-status";
// eslint-disable-next-line import/no-unresolved
import {
  analyze,
  BOOKKEEPING_COLUMNS,
  collectCurrentFunctionDefinitions,
  diffAgainstBaseline,
  DROPPED_QUEUE_COLUMNS,
  parseQueueWrites,
  selectQueueRpcs,
  stripSqlComments,
} from "../scripts/lib/queue-rpc-contract.mjs";
// eslint-disable-next-line import/no-unresolved
import { parseQueueEntryTransitions } from "../scripts/lib/queue-transitions-source.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The transition table as the check script sees it, via text extraction. */
const extracted = parseQueueEntryTransitions(
  readFileSync(path.join(ROOT, "app/lib/queue-status.ts"), "utf8"),
);

function rpc(name: string, sql: string) {
  return [{ name, file: `fixture/${name}.sql`, sql: stripSqlComments(sql) }];
}

function run(sources: ReturnType<typeof rpc>) {
  return analyze({ rpcSources: sources, transitions: extracted });
}

/**
 * The check script cannot import queue-status.ts — it runs as plain node in CI
 * and that module imports a type from @/lib/db-types. It text-extracts the
 * table instead, which is only safe while this holds: a refactor of
 * queue-status.ts that defeats the extractor has to fail HERE, loudly, rather
 * than leave the gate silently checking against a stale or empty table.
 */
describe("transition-table extraction stays in step with the TypeScript", () => {
  test("extracted table deep-equals the real QUEUE_ENTRY_TRANSITIONS", () => {
    expect(extracted).toEqual(
      JSON.parse(JSON.stringify(QUEUE_ENTRY_TRANSITIONS)) as typeof extracted,
    );
  });

  test("resolves shared constants rather than reading identifier names", () => {
    // `columns: QUEUE_ENTRY_FULL_COLUMN_SET` and `queueState: QUEUE_STATUS_QUEUED`
    // are identifiers in the source; if either resolved to its own name instead
    // of its value, every column comparison below would be vacuous.
    expect(extracted.queued.queueState).toBe("queued");
    expect(extracted.queued.columns).toContain("assigned_to_user_id");
    expect(extracted.provider_status.legalFrom).toEqual(["assigned"]);
  });
});

describe("SQL text handling", () => {
  test("a comma inside a comment does not split a SET clause", () => {
    // The bug that made the first draft of this parser under-report: the real
    // 20260807130000 body hides `attempt_count = ...` behind a comment whose
    // English contains a comma.
    const { updates } = parseQueueWrites(
      stripSqlComments(`
        update campaign_queue cq
        set queue_state = 'assigned',
            -- fail_exhausted_campaign_queue_contacts keys on attempt_count, and
            -- reset_stale_campaign_queue_claims keys on claimed_at.
            attempt_count = COALESCE(cq.attempt_count, 0) + 1,
            assigned_to_user_id = v_user_id
        where cq.id = 1;
      `),
    );
    expect(updates[0].columns).toEqual([
      "queue_state",
      "attempt_count",
      "assigned_to_user_id",
    ]);
  });

  test("keeps string literals containing comment markers intact", () => {
    expect(stripSqlComments(`set dequeued_reason = 'a -- b'`)).toContain("'a -- b'");
  });

  test("stops the SET clause at FROM/WHERE/RETURNING", () => {
    const { updates } = parseQueueWrites(
      `update campaign_queue cq set queue_state = 'queued' from base b where cq.id = b.id returning cq.id`,
    );
    expect(updates[0].columns).toEqual(["queue_state"]);
  });

  test("reads a literal target state but not a computed one", () => {
    expect(parseQueueWrites(`update campaign_queue set queue_state = 'dequeued' where id = 1`)
      .updates[0]).toMatchObject({ targetState: "dequeued", targetIsLiteral: true });
    expect(parseQueueWrites(`update campaign_queue set queue_state = v_next where id = 1`)
      .updates[0]).toMatchObject({ targetState: null, targetIsLiteral: false });
  });
});

describe("seeded drift is caught", () => {
  test("(b) a surviving reference to the dropped `status` column", () => {
    const { violations } = run(
      rpc(
        "drifted_enqueue",
        `create or replace function public.drifted_enqueue() returns void language plpgsql as $$
         begin
           update campaign_queue cq set status = 'queued' where cq.id = 1;
         end; $$;`,
      ),
    );
    expect(violations.some((v) => v.kind === "dropped-column" && v.column === "status")).toBe(true);
  });

  test("(b) a dropped column read through a table alias", () => {
    // The 20260803120000 failure mode: `cq.status` in a WHERE, never written.
    const { violations } = run(
      rpc(
        "drifted_loader",
        `create or replace function public.drifted_loader() returns setof record language sql as $$
           select cq.id from campaign_queue cq where cq.status = 'queued';
         $$;`,
      ),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "dropped-column", column: "status" });
  });

  test("(b) `status` on a JOINed table is NOT a violation", () => {
    // contact.status and message.status are live columns. A check that flagged
    // them would be turned off within a week.
    const { violations } = run(
      rpc(
        "reads_contact_status",
        `create or replace function public.reads_contact_status() returns setof record language sql as $$
           select cq.id from campaign_queue cq join contact c on c.id = cq.contact_id
           where c.status = 'active' and cq.queue_state = 'queued';
         $$;`,
      ),
    );
    expect(violations).toEqual([]);
  });

  test("(a) writing a column outside the vocabulary", () => {
    const { violations } = run(
      rpc(
        "drifted_column",
        `create or replace function public.drifted_column() returns void language plpgsql as $$
         begin
           update campaign_queue set queue_state = 'dequeued', assigned_to_user_id = null,
             provider_status = null, dequeued_at = now(), dequeued_by = null,
             dequeued_reason = 'x', invented_column = 42 where id = 1;
         end; $$;`,
      ),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "unknown-column", column: "invented_column" });
    expect(violations[0].message).toContain("BOOKKEEPING_COLUMNS");
  });

  test("(a) an allowlisted bookkeeping column is not a violation", () => {
    const { violations } = run(
      rpc(
        "bumps_attempts",
        `create or replace function public.bumps_attempts() returns void language plpgsql as $$
         begin
           update campaign_queue set attempts = attempts + 1, last_attempt_at = now() where id = 1;
         end; $$;`,
      ),
    );
    expect(violations).toEqual([]);
  });

  test("(c) a lifecycle state the transition table does not know", () => {
    const { violations } = run(
      rpc(
        "drifted_state",
        `create or replace function public.drifted_state() returns void language plpgsql as $$
         begin
           update campaign_queue set queue_state = 'parked' where id = 1;
         end; $$;`,
      ),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "unknown-state", state: "parked" });
  });

  test("(c) a transition that omits columns its contract requires", () => {
    const { violations } = run(
      rpc(
        "partial_dequeue",
        `create or replace function public.partial_dequeue() returns void language plpgsql as $$
         begin
           update campaign_queue set queue_state = 'dequeued', dequeued_at = now() where id = 1;
         end; $$;`,
      ),
    );
    const missing = violations.find((v) => v.kind === "missing-column");
    expect(missing).toBeDefined();
    expect(missing!.columns).toEqual(
      expect.arrayContaining(["assigned_to_user_id", "dequeued_by", "dequeued_reason"]),
    );
  });

  test("(c) a transition writing its full column set passes", () => {
    const { violations } = run(
      rpc(
        "full_dequeue",
        `create or replace function public.full_dequeue() returns void language plpgsql as $$
         begin
           update campaign_queue set queue_state = 'dequeued', assigned_to_user_id = null,
             provider_status = null, dequeued_at = now(), dequeued_by = v_user,
             dequeued_reason = 'done' where id = 1;
         end; $$;`,
      ),
    );
    expect(violations).toEqual([]);
  });

  test("an unnamed INSERT column list is a violation", () => {
    const { violations } = run(
      rpc(
        "positional_insert",
        `create or replace function public.positional_insert() returns void language plpgsql as $$
         begin
           insert into campaign_queue values (1, 2, 3);
         end; $$;`,
      ),
    );
    expect(violations.some((v) => v.kind === "positional-insert")).toBe(true);
  });
});

describe("check level is reported for every RPC, never skipped", () => {
  test("a computed queue_state gets (a)+(b) and says why not (c)", () => {
    const { checked } = run(
      rpc(
        "computed_state",
        `create or replace function public.computed_state() returns void language plpgsql as $$
         begin
           update campaign_queue set queue_state = v_state where id = 1;
         end; $$;`,
      ),
    );
    expect(checked[0].levels).toEqual(["dropped-columns", "column-vocabulary"]);
    expect(checked[0].notes.join(" ")).toContain("computed");
  });

  test("a read-only RPC gets (b) and says why", () => {
    const { checked } = run(
      rpc(
        "reader",
        `create or replace function public.reader() returns setof record language sql as $$
           select cq.id from campaign_queue cq; $$;`,
      ),
    );
    expect(checked[0].levels).toEqual(["dropped-columns"]);
    expect(checked[0].notes.join(" ")).toContain("reads campaign_queue only");
  });
});

describe("the real migration lineage", () => {
  const definitions = collectCurrentFunctionDefinitions(ROOT);
  const rpcs = selectQueueRpcs(definitions);
  const result = analyze({ rpcSources: rpcs, transitions: extracted });
  const baseline = JSON.parse(
    readFileSync(path.join(ROOT, "scripts/queue-rpc-contract-baseline.json"), "utf8"),
  ) as Record<string, string>;

  test("finds the queue RPCs at all", () => {
    expect(rpcs.length).toBeGreaterThan(15);
    for (const name of [
      "claim_next_queue_contact",
      "claim_queue_entry_for_dial",
      "select_and_update_campaign_contacts",
      "auto_dial_queue",
      "handle_campaign_queue_entry",
      "dequeue_contact",
      "reset_campaign",
      "reset_stale_campaign_queue_claims",
    ]) {
      expect(rpcs.map((r) => r.name)).toContain(name);
    }
  });

  test("resolves the LATEST definition, not a superseded one", () => {
    // handle_campaign_queue_entry is defined three times across the lineage
    // (baseline, 20260716120000, 20260814120000). Checking a superseded body
    // would report drift repaired months ago.
    const enqueue = rpcs.find((r) => r.name === "handle_campaign_queue_entry");
    expect(enqueue!.file).toBe("client/migrations/20260814120000_requeue_clears_assigned_user.sql");
  });

  test("no queue RPC still references the dropped `status` column", () => {
    // The state the four repair migrations were chasing. This is the assertion
    // that would have failed before any of them landed.
    expect(result.violations.filter((v) => v.kind === "dropped-column")).toEqual([]);
  });

  test("no queue RPC writes a column outside the vocabulary", () => {
    expect(result.violations.filter((v) => v.kind === "unknown-column")).toEqual([]);
  });

  test("every remaining violation is baselined with a written reason", () => {
    const { added, stale } = diffAgainstBaseline(result.violations, baseline);
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
    for (const v of result.violations) {
      // A generic regenerated message means nobody justified the entry.
      expect(baseline[v.key]).not.toBe(v.message);
      expect(baseline[v.key].length).toBeGreaterThan(80);
    }
  });

  test("every bookkeeping allowlist entry carries a reason and is still used", () => {
    const written = new Set(
      rpcs.flatMap((r) => {
        const { updates, inserts } = parseQueueWrites(r.sql);
        return [...updates.flatMap((u) => u.columns), ...inserts.flatMap((i) => i.columns)];
      }),
    );
    for (const [column, reason] of BOOKKEEPING_COLUMNS) {
      expect(reason.length).toBeGreaterThan(30);
      // `workspace` is written by a trigger rather than an RPC; the rest must
      // still be reachable, so the allowlist cannot accumulate dead entries.
      if (column !== "workspace") expect(written).toContain(column);
    }
  });

  test("the dropped-column register names why each column is gone", () => {
    expect(DROPPED_QUEUE_COLUMNS.get("status")).toContain("queue_state");
  });
});

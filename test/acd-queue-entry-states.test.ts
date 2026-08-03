import { describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("@/lib/env.server", () => {
  const handler = { get: () => () => "test" };
  return { env: new Proxy({}, handler) };
});

const executed = vi.hoisted(() => ({ queries: [] as unknown[] }));

vi.mock("@/server/admin-db", () => ({
  adminDb: {
    execute: vi.fn(async (query: unknown) => {
      executed.queries.push(query);
      return [];
    }),
  },
}));
vi.mock("@/server/db", () => ({ db: {} }));

import { queue_entry_state } from "@/db/schema";
import {
  countInboundQueueOfferAttempts,
  findExistingInboundQueueEntry,
} from "@/lib/acd/acd-router.server";

/**
 * Collect every quoted literal from a drizzle SQL fragment. `sql.raw` segments
 * land in `chunks` as objects carrying the literal text, which is exactly where
 * the state lists end up.
 */
function literalsIn(query: unknown): string[] {
  const found: string[] = [];
  // Drizzle table objects are cyclic, so track what has been walked.
  const seen = new WeakSet<object>();
  const visit = (node: unknown, depth: number) => {
    if (node == null || depth > 8) return;
    if (typeof node === "string") {
      for (const match of node.matchAll(/'([a-z_]+)'/g)) found.push(match[1]!);
      return;
    }
    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    Object.values(node as Record<string, unknown>).forEach((child) =>
      visit(child, depth + 1),
    );
  };
  visit(query, 0);
  return found;
}

describe("ACD queue-entry state filters", () => {
  /**
   * The filter used to name 'failed', which queue_entry_state does not have.
   * Postgres rejected the coercion on every inbound call and the error was
   * swallowed into generic hold TwiML, so nothing surfaced — the column was
   * typed as text() in schema.ts, so the type checker saw nothing either.
   */
  test("every state named in a queue-entry query is a real enum label", async () => {
    executed.queries.length = 0;
    await findExistingInboundQueueEntry({ queueId: 1, callSid: "CA1" });
    await countInboundQueueOfferAttempts({ queueId: 1, callSid: "CA1" });

    const labels = new Set<string>(queue_entry_state.enumValues);
    const used = executed.queries.flatMap(literalsIn);

    expect(used.length).toBeGreaterThan(0);
    for (const state of used) {
      expect(labels, `"${state}" is not a queue_entry_state label`).toContain(state);
    }
  });

  /**
   * `declined` and `timed_out` must not count as active, or the entry blocks
   * its own re-offer and the caller holds until MAX_QUEUE_TIME_SECONDS while
   * MAX_OFFER_ATTEMPTS never applies.
   */
  test("a declined or timed-out entry is not treated as still active", async () => {
    executed.queries.length = 0;
    await findExistingInboundQueueEntry({ queueId: 1, callSid: "CA1" });

    const used = executed.queries.flatMap(literalsIn);
    expect(used).toEqual(expect.arrayContaining(["queued", "offered", "accepted"]));
    expect(used).not.toContain("declined");
    expect(used).not.toContain("timed_out");
  });
});

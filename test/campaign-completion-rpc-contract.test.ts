import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { SETTLED_SMS_STATUSES } from "@/lib/sms-status";
import { TERMINAL_CALL_STATUSES } from "@/lib/telephony-db.server";

/**
 * The #1728 completion gate lives in plpgsql:
 *   - campaign_has_unsettled_calls(integer)  — reads public.call, so its
 *     terminal list is the source of truth for when a campaign may complete;
 *   - try_complete_campaign_if_drained       — the gate that calls it.
 *
 * The TypeScript half (TERMINAL_CALL_STATUSES in @/lib/telephony-db.server)
 * drives the status-transition guard in app code. The two halves have to
 * agree, and the SQL has to remember the `::text` casts — call.status is a
 * Postgres ENUM in real lineages and lower(<enum>) throws (the
 * call-status-guard integration test documents that history). This test
 * extracts the live migration bodies and pins them; it fails loudly on any
 * drift instead of leaving the gate silently checking a stale list.
 */

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../client/migrations");

function migrationSql(): string {
  // Sorted by filename = migration order; later CREATE OR REPLACE wins.
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function lastFunctionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const idx = sql.lastIndexOf(marker);
  if (idx < 0) throw new Error(`migration body for ${name} not found`);
  const tail = sql.slice(idx);
  const terminator = tail.indexOf("$function$;");
  const dollar = tail.indexOf("$$;");
  const end = (() => {
    const candidates = [terminator, dollar].filter((n) => n >= 0);
    return candidates.length ? Math.min(...candidates) : tail.length;
  })();
  return tail.slice(0, end);
}

describe("campaign completion gate SQL ↔ TypeScript parity (#1728, #2048)", () => {
  const sql = migrationSql();

  test("try_complete_campaign_if_drained checks the queue, the unsettled-call gate AND the unsettled-message gate", () => {
    const body = lastFunctionBody(sql, "try_complete_campaign_if_drained");
    expect(body).toContain("campaign_queue_has_pending_work");
    expect(body).toContain("campaign_has_unsettled_calls");
    expect(body).toContain("campaign_has_unsettled_messages");
    // Order matters: pending queue work short-circuits first.
    expect(body.indexOf("campaign_queue_has_pending_work")).toBeLessThan(
      body.indexOf("campaign_has_unsettled_calls"),
    );
    // The message gate runs after the call gate, so the IVR short-circuit is
    // never evaluated against a message-only campaign.
    expect(body.indexOf("campaign_has_unsettled_calls")).toBeLessThan(
      body.indexOf("campaign_has_unsettled_messages"),
    );
    expect(body).toMatch(/status in \('running', 'waiting'\)/);
  });

  test("campaign_has_unsettled_calls treats NULL status as unsettled and casts the enum to text", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_calls");
    // lower(<enum>) does not exist in real lineages — the cast is the guard.
    expect(body).toMatch(/lower\(c\.status::text\)/);
    expect(body).toMatch(/coalesce\(lower\(c\.status::text\), ''\)/);
  });

  test("campaign_has_unsettled_messages treats NULL status as unsettled and casts the enum to text", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_messages");
    // Same enum-cast guard as calls. A NULL status means the intent row exists
    // but no provider callback has reported a state — that must block
    // completion, or the gate leaks early completions.
    expect(body).toMatch(/lower\(m\.status::text\)/);
    expect(body).toMatch(/coalesce\(lower\(m\.status::text\), ''\)/);
  });

  test("campaign_has_unsettled_messages is scoped to one campaign", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_messages");
    // A message for another campaign must not hold this campaign open.
    expect(body).toMatch(/m\.campaign_id = campaign_id_pro/);
  });

  test("the SQL call-terminal list matches TERMINAL_CALL_STATUSES exactly", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_calls");
    const notInMatch = body.match(/not in\s*\(([\s\S]*?)\)/);
    expect(notInMatch).not.toBeNull();
    const sqlStatuses = Array.from(
      (notInMatch as RegExpMatchArray)[1].matchAll(/'([^']+)'/g),
    ).map((m) => m[1]);
    expect(sqlStatuses.sort()).toEqual([...TERMINAL_CALL_STATUSES].sort());
  });

  test("the SQL message-settled list matches SETTLED_SMS_STATUSES exactly", () => {
    // The contract value comes from app/lib/sms-status.ts, which is derived from
    // the provider lifecycle in
    // docs/remediation/critical-review-orchestration-plan-2026-07-12.md. If
    // someone narrows the SQL list to the billing set, this fails and a
    // campaign can hang forever on a `canceled` message.
    const body = lastFunctionBody(sql, "campaign_has_unsettled_messages");
    const notInMatch = body.match(/not in\s*\(([\s\S]*?)\)/);
    expect(notInMatch).not.toBeNull();
    const sqlStatuses = Array.from(
      (notInMatch as RegExpMatchArray)[1].matchAll(/'([^']+)'/g),
    ).map((m) => m[1]);
    expect(sqlStatuses.sort()).toEqual([...SETTLED_SMS_STATUSES].sort());
  });

  test("the unsettled-campaign sweep reuses the same settled list and NULL rule", () => {
    // The recovery sweep must agree with the gate, character for character. A
    // first version of this filter re-implemented the predicate in Drizzle with
    // `notInArray(status, [...])`, which silently DROPS NULL rows because
    // `NULL NOT IN (...)` is NULL, not true. The gate blocks on a NULL status
    // (it coalesces to ''), so a campaign whose messages had no provider
    // callback was blocked forever and the sweep could never unblock it. That
    // is precisely the intent-without-callback case that let the Lombardi
    // campaign report complete while Twilio held its messages.
    const body = lastFunctionBody(sql, "campaign_ids_with_unsettled_messages");
    expect(body).toMatch(/coalesce\(lower\(m\.status::text\), ''\)/);
    const notInMatch = body.match(/not in\s*\(([\s\S]*?)\)/);
    expect(notInMatch).not.toBeNull();
    const sqlStatuses = Array.from(
      (notInMatch as RegExpMatchArray)[1].matchAll(/'([^']+)'/g),
    ).map((m) => m[1]);
    expect(sqlStatuses.sort()).toEqual([...SETTLED_SMS_STATUSES].sort());
  });

  test("the sweep is scoped to one workspace and yields one row per campaign", () => {
    // Without a per-campaign grouping, a campaign with 23,504 unsettled rows
    // consumes the whole row limit and starves every other campaign. Verified
    // against real Postgres: a 1-row campaign was never returned while a
    // 23,504-row one filled the budget.
    const body = lastFunctionBody(sql, "campaign_ids_with_unsettled_messages");
    expect(body).toMatch(/group by\s+m\.campaign_id/i);
    expect(body).toMatch(/m\.workspace = workspace_id_pro/);
    expect(body).toMatch(/m\.campaign_id is not null/);
  });

  test("the sweep orders its candidates so progress is guaranteed", () => {
    // No ordering means the limit picks an arbitrary subset, so a campaign can
    // be starved for an unbounded number of sweeps. Oldest-stranded first gives
    // the longest-waiting campaign a slot on every run.
    const body = lastFunctionBody(sql, "campaign_ids_with_unsettled_messages");
    expect(body).toMatch(/order by\s+min\(m\.date_created\)/i);
    expect(body).toMatch(/limit/i);
  });
});

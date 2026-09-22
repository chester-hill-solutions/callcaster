import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

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

describe("campaign completion gate SQL ↔ TypeScript parity (#1728)", () => {
  const sql = migrationSql();

  test("try_complete_campaign_if_drained checks the queue AND the unsettled-call gate", () => {
    const body = lastFunctionBody(sql, "try_complete_campaign_if_drained");
    expect(body).toContain("campaign_queue_has_pending_work");
    expect(body).toContain("campaign_has_unsettled_calls");
    // Order matters: pending queue work short-circuits first.
    expect(body.indexOf("campaign_queue_has_pending_work")).toBeLessThan(
      body.indexOf("campaign_has_unsettled_calls"),
    );
    expect(body).toMatch(/status in \('running', 'waiting'\)/);
  });

  test("campaign_has_unsettled_calls treats NULL status as unsettled and casts the enum to text", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_calls");
    // lower(<enum>) does not exist in real lineages — the cast is the guard.
    expect(body).toMatch(/lower\(c\.status::text\)/);
    expect(body).toMatch(/coalesce\(lower\(c\.status::text\), ''\)/);
  });

  test("the SQL terminal list matches TERMINAL_CALL_STATUSES exactly", () => {
    const body = lastFunctionBody(sql, "campaign_has_unsettled_calls");
    const notInMatch = body.match(/not in\s*\(([\s\S]*?)\)/);
    expect(notInMatch).not.toBeNull();
    const sqlStatuses = Array.from(
      (notInMatch as RegExpMatchArray)[1].matchAll(/'([^']+)'/g),
    ).map((m) => m[1]);
    expect(sqlStatuses.sort()).toEqual([...TERMINAL_CALL_STATUSES].sort());
  });
});

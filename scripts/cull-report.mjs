#!/usr/bin/env node
/**
 * Read-only cull report: which dev workspaces and numbers are safe to release?
 *
 * Usage:
 *   DATABASE_URL=... node scripts/cull-report.mjs [--days 60] [--json]
 *
 * Read-only by design. There is no delete path in this file and there should
 * not be one: release is a separate, reviewed step. The first run of this
 * (#2168) was done by hand and threw the queries away, which is the thing this
 * script exists to stop.
 *
 * ## The rule
 *
 * Keep a workspace if it is on the explicit keep-list OR has had a call, a
 * message, or a campaign in the last N days. Everything else is a cull
 * candidate. Keep a number if its owning workspace survives — never cull a
 * number out from under a workspace that is being kept.
 *
 * ## What this reports that a naive query gets wrong
 *
 * - **Test credentials.** A `+1555…` number with no `twilio_phone_number_sid`
 *   has nothing at Twilio. Reporting it as "clear to release" sends someone to
 *   the console for a number that was never there.
 * - **E911.** A number with an emergency address cannot be released via API at
 *   all — Twilio refuses until the address goes, and re-validates the binding on
 *   every update, so the two cannot be detached programmatically.
 * - **Self-referential campaign refs.** A campaign referencing a candidate
 *   number in the SAME workspace is a consequence of the cull, not a live
 *   dependency. Only a cross-workspace reference is a blocker.
 */

import postgres from "postgres";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const asJson = args.includes("--json");

const WINDOW_DAYS = Number(flag("days", "60"));
const KEEP_LIST = (flag("keep", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Timestamps are `timestamptz` in Postgres even though the Drizzle schema
 * declares `text()` for several of these columns. Compare as dates. A
 * lexicographic string comparison is not merely wrong here, it is rejected
 * outright — `timestamptz > text` has no operator.
 */
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ...(process.env.DATABASE_PUBLIC_URL ? { ssl: false } : {}),
});

const rows = await sql.unsafe(`
  WITH act AS (
    SELECT w.id,
           GREATEST(max(c.date_created), max(m.date_created), max(camp.created_at)) AS last_any
    FROM workspace w
    LEFT JOIN call c       ON c.workspace = w.id
    LEFT JOIN message m    ON m.workspace = w.id
    LEFT JOIN campaign camp ON camp.workspace = w.id
    GROUP BY w.id
  ),
  nums AS (
    SELECT workspace,
           count(*) FILTER (WHERE type = 'rented')::int    AS rented,
           count(*) FILTER (WHERE type = 'caller_id')::int AS caller_id,
           count(*)::int                                   AS total
    FROM workspace_number
    GROUP BY workspace
  )
  SELECT w.id, w.name, w.disabled, act.last_any::text AS last_any,
         COALESCE(nums.total, 0)::int     AS numbers_total,
         COALESCE(nums.rented, 0)::int    AS rented,
         COALESCE(nums.caller_id, 0)::int AS caller_id
  FROM workspace w
  LEFT JOIN act  ON act.id = w.id
  LEFT JOIN nums ON nums.workspace = w.id
  ORDER BY act.last_any DESC NULLS LAST, w.name
`);

const ageDays = (iso) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : null;

function verdict(row) {
  if (KEEP_LIST.includes(row.id)) return { verdict: "KEEP", why: "keep-list" };
  const age = ageDays(row.last_any);
  if (age === null) return { verdict: "CULL", why: "no activity ever", ageDays: null };
  if (age <= WINDOW_DAYS)
    return { verdict: "KEEP", why: `active ${age.toFixed(0)}d ago`, ageDays: Math.round(age) };
  return { verdict: "CULL", why: `last activity ${age.toFixed(0)}d ago`, ageDays: Math.round(age) };
}

/** Per-number reference check. Returns blockers and, separately, notes. */
async function checkNumber(wsId, phone, numId) {
  const blockers = [];
  const notes = [];

  const [row] = await sql.unsafe(
    `SELECT twilio_phone_number_sid, friendly_name
       FROM workspace_number WHERE id = $1`, [numId]);

  if (!row) return { blockers: ["number row missing"], notes: [] };
  if (!row.twilio_phone_number_sid) {
    // A 555 test credential: nothing exists at Twilio, so "release" is a row
    // delete only. Do not send an operator to the console for it.
    notes.push("test credential — no Twilio SID, row delete only");
  }
  if (/^\+?1555\d/.test(phone ?? "")) {
    notes.push("555 range — almost certainly a test number");
  }
  if (!phone) blockers.push("no phone_number");

  const [msRow] = await sql.unsafe(
    `SELECT twilio_data->'onboarding'->'messagingService'->>'serviceSid' AS sid FROM workspace WHERE id = $1`, [wsId]);
  if (msRow.sid) notes.push(`attached to messaging service ${msRow.sid}`);

  const [calls] = await sql.unsafe(
    `SELECT count(*)::int AS n FROM call
      WHERE workspace = $1 AND ("from" = $2 OR "to" = $2 OR parent_call_sid = $2)`, [wsId, phone]);
  const [msgs] = await sql.unsafe(
    `SELECT count(*)::int AS n FROM message WHERE workspace = $1 AND ("from" = $2 OR "to" = $2)`, [wsId, phone]);

  if (calls.n > 0) notes.push(`${calls.n} call row(s) reference it`);
  if (msgs.n > 0) notes.push(`${msgs.n} message row(s) reference it`);

  // Only a CROSS-workspace campaign reference is a blocker. Same-workspace refs
  // die with the cull and are noise if reported as blockers.
  const camps = await sql.unsafe(
    `SELECT c.workspace, w.name AS owning FROM campaign c
       LEFT JOIN workspace w ON w.id = c.workspace
      WHERE c.caller_id = $1`, [phone]);
  for (const c of camps) {
    if (c.workspace === wsId) {
      notes.push("referenced by a campaign in the same workspace (dies with the cull)");
    } else {
      blockers.push(`LIVE: campaign in workspace "${c.owning ?? "(orphaned)"}" uses it as caller_id`);
    }
  }
  return { blockers, notes };
}

const report = [];
for (const row of rows) {
  const v = verdict(row);
  const numbers = [];
  if (row.numbers_total > 0) {
    const ns = await sql.unsafe(
      `SELECT id, phone_number, type, twilio_phone_number_sid
         FROM workspace_number WHERE workspace = $1 ORDER BY id`, [row.id]);
    for (const n of ns) {
      const { blockers, notes } = await checkNumber(row.id, n.phone_number, n.id);
      numbers.push({ ...n, blockers, notes });
    }
  }
  report.push({ ...row, ...v, numbers });
}

const sum = (list, k) => list.reduce((a, r) => a + (r[k] || 0), 0);
const keeps = report.filter((r) => r.verdict === "KEEP");
const culls = report.filter((r) => r.verdict === "CULL");

if (asJson) {
  console.log(JSON.stringify({ windowDays: WINDOW_DAYS, report }, null, 2));
} else {
  const pad = (s, n) => String(s ?? "—").slice(0, n).padEnd(n);
  const label = (r) => {
    if (r.why === "keep-list") return "KEEP list";
    if (r.ageDays === null) return `${r.verdict} never`;
    return `${r.verdict} ${r.ageDays}d`;
  };
  console.log(
    `\nCull report — ${report.length} workspaces, ${sum(report, "numbers_total")} numbers ` +
    `(window ${WINDOW_DAYS}d${KEEP_LIST.length ? `, keep-list ${KEEP_LIST.length}` : ""})\n`,
  );
  console.log(`  KEEP ${keeps.length} (${sum(keeps, "numbers_total")} numbers)   CULL ${culls.length} (${sum(culls, "numbers_total")} numbers)\n`);
  console.log(pad("VERDICT", 12), pad("WORKSPACE", 34), pad("NUM", 4), pad("RENT", 5), pad("CID", 4), "LAST ACTIVITY");
  for (const r of report) {
    console.log(
      pad(label(r), 12),
      pad(r.name, 34), pad(r.numbers_total, 4), pad(r.rented, 5), pad(r.caller_id, 4),
      r.last_any ? String(r.last_any).slice(0, 10) : "—",
    );
  }
  const candidates = report.filter((r) => r.verdict === "CULL" && r.numbers.length);
  if (candidates.length) {
    console.log(`\nREFERENCE CHECK — ${candidates.length} cull candidate(s) with numbers`);
    for (const r of candidates) {
      for (const n of r.numbers) {
        console.log(`\n  ${pad(r.name, 30)} ${pad(n.phone_number ?? "—", 14)} ${n.blockers.length ? "BLOCKED" : "clear"}`);
        for (const b of n.blockers) console.log(`     BLOCKER  ${b}`);
        for (const note of n.notes) console.log(`     note     ${note}`);
        // E911 state is not readable from the database — only from Twilio. One
        // real candidate in the first run could not be released at all because
        // of an emergency address, and no database column would have said so.
        if (n.twilio_phone_number_sid)
          console.log(`     VERIFY   E911 status in Twilio — an emergency address blocks release and cannot be detached via API`);
      }
    }
  }
  console.log(
    `\nRead-only. Nothing was changed. Release is a separate, reviewed step.\n`,
  );
}

await sql.end();

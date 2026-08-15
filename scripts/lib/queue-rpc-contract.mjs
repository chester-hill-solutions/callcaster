/* eslint-env node */
/**
 * The QueueEntry state machine, as the plpgsql RPCs actually implement it.
 *
 * `app/lib/queue-status.ts` holds the TypeScript half — QUEUE_ENTRY_TRANSITIONS,
 * a plain-data table of which `campaign_queue` columns each lifecycle transition
 * writes. Roughly eighteen plpgsql functions implement the same lifecycle a
 * second time, and the two halves have drifted repeatedly:
 *
 *   20260716120000  handle_campaign_queue_entry still SET `status` after the
 *                   column was dropped — the only enqueue RPC, so no campaign
 *                   could be populated and nothing dialed.
 *   20260716130000  the same dropped-column reference in the sibling dial RPCs.
 *   20260722120000  cancel/reset RPCs, same cause; its own header deferred
 *                   two more functions to a follow-up that was never written.
 *   20260803120000  that follow-up, eleven days later: the campaign queue
 *                   loader had been raising `column cq.status does not exist`
 *                   on every call the whole time. Also dropped an orphaned
 *                   overload whose existence made every 1-arg call ambiguous
 *                   ("function is not unique").
 *
 * Four repair migrations for one class of bug, each found in production rather
 * than in CI, because nothing compares the two implementations. `check-db-rpcs`
 * asks only whether a function EXISTS; its header says outright that it cannot
 * see inside one. This module sees inside.
 *
 * Everything here is pure: {@link analyze} takes already-read SQL and a
 * transition table and returns violations. The fs/lineage half lives in the
 * `collect*` helpers, and the CLI wrapper is `scripts/check-queue-rpc-contract.mjs`.
 * Same split as `app-db-objects.mjs`, for the same reason — the logic has to be
 * testable against seeded drift without a database or a migrations tree.
 *
 * THREE LEVELS OF CHECKING. Not every RPC can get all three, and the CLI prints
 * which each one got — a silent skip is how the 20260722120000 follow-up got
 * lost.
 *
 *   (a) column vocabulary   every campaign_queue column an RPC SETs or INSERTs
 *                           is either a QUEUE_ENTRY_TRANSITIONS column or an
 *                           explicitly-reasoned bookkeeping column. Applies to
 *                           every RPC that writes campaign_queue.
 *   (b) dropped columns     no reference to a column the v2 normalization
 *                           removed (`status`). Applies to every RPC that
 *                           mentions campaign_queue at all, read or write —
 *                           the loader bug was a read.
 *   (c) transition coverage for an UPDATE whose SET assigns queue_state a bare
 *                           string literal, that literal must name a known
 *                           state and the SET must cover that transition's
 *                           `columns`. Only applies to literal targets: an
 *                           RPC computing queue_state from a variable or CASE
 *                           has no single target state to check against, and
 *                           guessing one would be worse than saying so.
 *
 * PRE-EXISTING DRIFT is carried in a baseline (see the CLI), following the
 * ratchet convention already used by check-effects / check-dry /
 * check-type-safety: today's known violations are listed with a reason, any
 * NEW violation fails, and a baseline entry that no longer reproduces also
 * fails so the list can only shrink.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SQL that builds the schema, in bootstrap apply order — drizzle baseline then
 * client migrations, exactly the interleave `scripts/db/bootstrap-fresh-db.mjs`
 * applies. Order is the whole point here: a function's CURRENT definition is
 * the last CREATE OR REPLACE to win, and checking a superseded body would
 * report drift that was repaired months ago.
 *
 * `scripts/schema-transform/` is deliberately absent. Those files migrate an
 * existing Supabase-era database forward; they are not replayed onto a fresh
 * one, and the drizzle baseline is a dump taken AFTER they ran.
 */
export const LINEAGE_DIRS = ["drizzle", "client/migrations"];

/** The table whose state machine this module is about. */
export const QUEUE_TABLE = "campaign_queue";

/**
 * Columns the v2 normalization removed from campaign_queue. A surviving
 * reference to one of these is not a style problem — it raises
 * `column ... does not exist` the first time the function runs.
 *
 * `status` is the whole reason this check exists. `scripts/schema-transform/
 * 03a-rewrite-queue-rpcs.sql` migrated the queue RPCs off it and `03b` dropped
 * it; the four repair migrations above are the functions 03a missed.
 */
export const DROPPED_QUEUE_COLUMNS = new Map([
  [
    "status",
    "dropped by schema-transform/03b-drop-queue-status.sql; split into " +
      "queue_state + assigned_to_user_id + provider_status",
  ],
]);

/**
 * campaign_queue columns a queue RPC may write that are NOT part of the
 * QueueEntry lifecycle vocabulary. Bookkeeping, not state: nothing in
 * QUEUE_ENTRY_TRANSITIONS should ever describe them, and a write to one is
 * never by itself evidence of drift.
 *
 * Every entry is here because a real function writes it today. Adding one is a
 * review decision — the failure message says so — because the cheap way to
 * silence this check is to declare a genuinely-drifted column "bookkeeping".
 */
export const BOOKKEEPING_COLUMNS = new Map([
  [
    "attempts",
    "legacy dial-attempt counter (bigint, on the table since the Supabase era). " +
      "Still written by the dial paths and read by the queue UI.",
  ],
  [
    "attempt_count",
    "the counter the max-attempts guards actually read. Distinct from " +
      "`attempts`: 20260803130000 and 20260807130000 exist because claim paths " +
      "bumped one and not the other, so fail_exhausted_campaign_queue_contacts " +
      "never fired and contacts were redialed forever.",
  ],
  [
    "claimed_at",
    "when the current claim was taken. reset_stale_campaign_queue_claims and " +
      "campaign_queue_has_pending_work key on it to reclaim abandoned rows.",
  ],
  [
    "last_attempt_at",
    "telemetry/ordering for the last dial attempt; not a lifecycle state.",
  ],
  [
    "last_attempt_error",
    "last failure text, carried alongside last_attempt_at for diagnostics.",
  ],
  [
    "queue_order",
    "position within the campaign queue. handle_campaign_queue_entry assigns " +
      "it on enqueue and on reactivation; ordering is not lifecycle state.",
  ],
  [
    "contact_id",
    "identity column, INSERT only (handle_campaign_queue_entry's fresh-row branch).",
  ],
  [
    "campaign_id",
    "identity column, INSERT only (handle_campaign_queue_entry's fresh-row branch).",
  ],
  [
    "workspace",
    "tenant column added by 20260705000200. Normally populated by the " +
      "campaign_queue_set_workspace BEFORE trigger rather than written directly.",
  ],
]);

// ─── SQL text handling ────────────────────────────────────────────────────

/**
 * Strip `--` and block comments, preserving single-quoted literals.
 *
 * Not cosmetic. The first version of this parser split SET clauses on commas
 * without stripping comments, and
 *
 *     attempt_count = COALESCE(cq.attempt_count, 0) + 1,   -- in 20260807130000
 *
 * sat behind the comment "-- fail_exhausted_campaign_queue_contacts keys on
 * attempt_count, and ...". The comma in that ENGLISH SENTENCE split the clause,
 * and the parser silently lost the assignment — a check that under-reports is
 * worse than no check, so comments go first.
 */
export function stripSqlComments(sql) {
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl - 1;
      out += "\n";
      continue;
    }
    if (two === "/*") {
      const close = sql.indexOf("*/", i + 2);
      i = (close === -1 ? sql.length : close + 1);
      out += " ";
      continue;
    }
    if (sql[i] === "'") {
      const start = i;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      out += sql.slice(start, i + 1);
      continue;
    }
    out += sql[i];
  }
  return out;
}

const CREATE_FUNCTION_RE =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.|app_auth\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
const DROP_FUNCTION_RE =
  /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.|app_auth\.)?"?([a-z_][a-z0-9_]*)"?/gi;

/**
 * The text of one CREATE FUNCTION statement, starting at `at`.
 *
 * plpgsql bodies are dollar-quoted (`$$`, `$function$`), and the tag that opens
 * the body is the tag that closes it. Anything before that opener — the arg
 * list, RETURNS, LANGUAGE, SECURITY DEFINER — is part of the statement too, so
 * we take from the CREATE through the closing tag. SQL-language functions with
 * no dollar quote fall back to the first semicolon.
 */
function sliceFunctionStatement(src, at) {
  const rest = src.slice(at);
  const tag = rest.match(/\$([a-z_]*)\$/i);
  if (!tag) {
    const semi = rest.indexOf(";");
    return semi === -1 ? rest : rest.slice(0, semi + 1);
  }
  const open = rest.indexOf(tag[0]);
  const close = rest.indexOf(tag[0], open + tag[0].length);
  return close === -1 ? rest : rest.slice(0, close + tag[0].length);
}

/**
 * Replay the lineage and return each function's CURRENT definition.
 *
 * Name granularity, matching `scripts/db/check-db-orphans.mjs`: a later CREATE
 * OR REPLACE of the same name supersedes the earlier one, a DROP removes it.
 * Overloads collapse onto one name — coarse, but the finer question (are there
 * orphaned overloads?) is check-db-orphans' job, and 20260803120000 shows the
 * repo's answer to an orphaned overload is to drop it, not to keep two bodies.
 *
 * @returns {Map<string, {name: string, file: string, sql: string}>}
 */
export function collectCurrentFunctionDefinitions(root, dirs = LINEAGE_DIRS) {
  const current = new Map();
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(join(root, dir)).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const src = readFileSync(join(root, dir, name), "utf8");
      const bare = stripSqlComments(src);
      const events = [];
      for (const m of bare.matchAll(CREATE_FUNCTION_RE))
        events.push({ at: m.index, fn: m[1].toLowerCase(), kind: "create" });
      for (const m of bare.matchAll(DROP_FUNCTION_RE))
        events.push({ at: m.index, fn: m[1].toLowerCase(), kind: "drop" });
      events.sort((a, b) => a.at - b.at);
      for (const e of events) {
        if (e.kind === "drop") current.delete(e.fn);
        else current.set(e.fn, { name: e.fn, file: rel, sql: sliceFunctionStatement(bare, e.at) });
      }
    }
  }
  return current;
}

/** The subset of {@link collectCurrentFunctionDefinitions} that mentions campaign_queue. */
export function selectQueueRpcs(definitions, table = QUEUE_TABLE) {
  const re = new RegExp(`\\b${table}\\b`, "i");
  return [...definitions.values()].filter((d) => re.test(d.sql)).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Statement parsing ────────────────────────────────────────────────────

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

const SET_CLAUSE_END = /^\s(?:from|where|returning)\b/i;

/** Text of a SET clause beginning at `after`, ending at FROM/WHERE/RETURNING/`;`/`)`. */
function sliceSetClause(after) {
  let depth = 0;
  for (let i = 0; i < after.length; i++) {
    const ch = after[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) return after.slice(0, i);
      depth--;
    } else if (depth === 0) {
      if (ch === ";") return after.slice(0, i);
      if (SET_CLAUSE_END.test(after.slice(i, i + 12))) return after.slice(0, i);
    }
  }
  return after;
}

const UPDATE_RE = new RegExp(
  `update\\s+(?:only\\s+)?(?:public\\.)?${QUEUE_TABLE}(?:\\s+(?:as\\s+)?([a-z_][a-z0-9_]*))?\\s+set\\b`,
  "gi",
);
// The optional alias slot must exclude the keywords that can follow the table
// name, or `INSERT INTO campaign_queue VALUES (1, 2)` parses "values" as an
// alias and "(1, 2)" as a column list — a positional insert read as a named
// one, which is backwards.
const INSERT_RE = new RegExp(
  `insert\\s+into\\s+(?:public\\.)?${QUEUE_TABLE}\\s*` +
    `(?:\\s+(?:as\\s+)?(?!values\\b|select\\b|default\\b|overriding\\b|on\\b)[a-z_][a-z0-9_]*\\s*)?\\(([^)]*)\\)`,
  "gi",
);
const INSERT_ANY_RE = new RegExp(`insert\\s+into\\s+(?:public\\.)?${QUEUE_TABLE}\\b`, "gi");

/**
 * Every campaign_queue write in a function body.
 *
 * @returns {{updates: Array<{columns: string[], targetState: string|null, targetIsLiteral: boolean}>,
 *            inserts: Array<{columns: string[]}>, positionalInserts: number}}
 */
export function parseQueueWrites(sql) {
  const updates = [];
  for (const m of sql.matchAll(UPDATE_RE)) {
    const clause = sliceSetClause(sql.slice(m.index + m[0].length));
    const columns = [];
    let targetState = null;
    let targetIsLiteral = false;
    for (const part of splitTopLevel(clause)) {
      const assign = part.match(/^\s*([a-z_][a-z0-9_]*)\s*=\s*([\s\S]*)$/i);
      if (!assign) continue;
      const column = assign[1].toLowerCase();
      columns.push(column);
      if (column !== "queue_state") continue;
      // A bare string literal is the only target (c) can trust. `queue_state =
      // v_state` or a CASE expression has no single destination state.
      const literal = assign[2].trim().match(/^'([^']*)'(?:::\s*[a-z_]+)?\s*$/i);
      if (literal) {
        targetState = literal[1];
        targetIsLiteral = true;
      }
    }
    updates.push({ columns: [...new Set(columns)], targetState, targetIsLiteral });
  }

  const inserts = [];
  for (const m of sql.matchAll(INSERT_RE)) {
    const columns = m[1]
      .split(",")
      .map((c) => c.trim().replace(/"/g, "").toLowerCase())
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
    inserts.push({ columns: [...new Set(columns)] });
  }
  const positionalInserts = [...sql.matchAll(INSERT_ANY_RE)].length - inserts.length;

  return { updates, inserts, positionalInserts: Math.max(0, positionalInserts) };
}

/**
 * Aliases bound to campaign_queue in this body, plus the table name itself.
 *
 * Needed so `cq.status` is a violation while `c.status` (contact) and
 * `m.status` (message) are not — several queue RPCs join tables that legitimately
 * still have a `status` column.
 */
export function collectQueueAliases(sql, table = QUEUE_TABLE) {
  const aliases = new Set([table, `public.${table}`]);
  const bind = new RegExp(
    `(?:from|join|update|into)\\s+(?:only\\s+)?(?:public\\.)?${table}\\s+(?:as\\s+)?([a-z_][a-z0-9_]*)`,
    "gi",
  );
  for (const m of sql.matchAll(bind)) {
    const alias = m[1].toLowerCase();
    // `UPDATE campaign_queue SET ...` — "set" is the keyword, not an alias.
    if (["set", "where", "values", "on", "using", "as", "select"].includes(alias)) continue;
    aliases.add(alias);
  }
  return aliases;
}

/** Dropped-column references, qualified or in a campaign_queue write. */
export function findDroppedColumnReferences(sql, dropped = DROPPED_QUEUE_COLUMNS, table = QUEUE_TABLE) {
  const hits = new Map();
  const aliases = collectQueueAliases(sql, table);
  for (const column of dropped.keys()) {
    for (const alias of aliases) {
      const re = new RegExp(`\\b${alias.replace(".", "\\.")}\\.${column}\\b`, "i");
      if (re.test(sql)) hits.set(column, (hits.get(column) ?? 0) + 1);
    }
    // Unqualified, but inside a campaign_queue write — `SET status = ...` or an
    // INSERT column list. This is the exact shape 20260716120000 repaired.
    const { updates, inserts } = parseQueueWrites(sql);
    for (const u of updates) if (u.columns.includes(column)) hits.set(column, (hits.get(column) ?? 0) + 1);
    for (const i of inserts) if (i.columns.includes(column)) hits.set(column, (hits.get(column) ?? 0) + 1);
  }
  return hits;
}

// ─── The check ────────────────────────────────────────────────────────────

/** Levels a single RPC was checked at; the CLI prints these so no skip is silent. */
export const LEVEL = {
  DROPPED_COLUMNS: "dropped-columns",
  COLUMN_VOCABULARY: "column-vocabulary",
  TRANSITION_COVERAGE: "transition-coverage",
};

/**
 * Compare the plpgsql queue RPCs against the TypeScript transition table.
 *
 * Pure. `rpcSources` is `[{name, file, sql}]` with comments already stripped;
 * `transitions` is QUEUE_ENTRY_TRANSITIONS from app/lib/queue-status.ts.
 *
 * @returns {{violations: Array<object>, checked: Array<object>, vocabulary: string[]}}
 */
export function analyze({
  rpcSources,
  transitions,
  bookkeeping = BOOKKEEPING_COLUMNS,
  dropped = DROPPED_QUEUE_COLUMNS,
  table = QUEUE_TABLE,
}) {
  const defs = Object.entries(transitions);
  // The lifecycle vocabulary is the union of every transition's columns — not a
  // second hand-written list. If B1 adds a column to the table, it becomes legal
  // here automatically; that coupling is the point.
  const vocabulary = new Set(defs.flatMap(([, def]) => def.columns));
  // queue_state value -> the transitions that write it.
  const byState = new Map();
  for (const [name, def] of defs) {
    if (!byState.has(def.queueState)) byState.set(def.queueState, []);
    byState.get(def.queueState).push({ name, def });
  }

  const violations = [];
  const checked = [];

  for (const rpc of rpcSources) {
    const { updates, inserts, positionalInserts } = parseQueueWrites(rpc.sql);
    const writes = updates.length + inserts.length + positionalInserts > 0;
    const levels = [LEVEL.DROPPED_COLUMNS];
    const notes = [];

    // (b) dropped columns — every RPC that mentions the table, read or write.
    for (const [column, count] of findDroppedColumnReferences(rpc.sql, dropped, table)) {
      violations.push({
        rpc: rpc.name,
        file: rpc.file,
        level: LEVEL.DROPPED_COLUMNS,
        kind: "dropped-column",
        column,
        key: `${rpc.name}:dropped-column:${column}`,
        message:
          `references ${table}.${column}, which no longer exists ` +
          `(${dropped.get(column)}). Every call raises ` +
          `\`column "${column}" does not exist\`.` +
          (count > 1 ? ` (${count} reference sites)` : ""),
      });
    }

    if (writes) {
      levels.push(LEVEL.COLUMN_VOCABULARY);

      if (positionalInserts > 0) {
        violations.push({
          rpc: rpc.name,
          file: rpc.file,
          level: LEVEL.COLUMN_VOCABULARY,
          kind: "positional-insert",
          key: `${rpc.name}:positional-insert`,
          message:
            `INSERT INTO ${table} with no column list. Column order is not a ` +
            `contract — name the columns so this check can see them.`,
        });
      }

      // (a) column vocabulary.
      const written = new Set([
        ...updates.flatMap((u) => u.columns),
        ...inserts.flatMap((i) => i.columns),
      ]);
      for (const column of [...written].sort()) {
        if (vocabulary.has(column) || bookkeeping.has(column) || dropped.has(column)) continue;
        violations.push({
          rpc: rpc.name,
          file: rpc.file,
          level: LEVEL.COLUMN_VOCABULARY,
          kind: "unknown-column",
          column,
          key: `${rpc.name}:unknown-column:${column}`,
          message:
            `writes ${table}.${column}, which is neither a QUEUE_ENTRY_TRANSITIONS ` +
            `column nor an allowlisted bookkeeping column. Either add it to a ` +
            `transition in app/lib/queue-status.ts (if it carries lifecycle state) ` +
            `or to BOOKKEEPING_COLUMNS in scripts/lib/queue-rpc-contract.mjs with a ` +
            `reason (if it does not).`,
        });
      }

      // (c) transition coverage — literal queue_state targets only.
      const literalUpdates = updates.filter((u) => u.targetIsLiteral);
      const stateUpdates = updates.filter((u) => u.columns.includes("queue_state"));
      if (literalUpdates.length > 0) {
        levels.push(LEVEL.TRANSITION_COVERAGE);
        for (const update of literalUpdates) {
          const candidates = byState.get(update.targetState);
          if (!candidates) {
            violations.push({
              rpc: rpc.name,
              file: rpc.file,
              level: LEVEL.TRANSITION_COVERAGE,
              kind: "unknown-state",
              state: update.targetState,
              key: `${rpc.name}:unknown-state:${update.targetState}`,
              message:
                `sets queue_state = '${update.targetState}', a value no ` +
                `QUEUE_ENTRY_TRANSITIONS entry writes. The TypeScript half ` +
                `cannot represent rows in this state.`,
            });
            continue;
          }
          // With several transitions writing the same state, the RPC satisfies
          // the contract if it covers any one of them — take the least
          // demanding, so `provider_status` (a same-state update) does not
          // force a full assignment rewrite onto every claim path.
          const best = candidates
            .map(({ name, def }) => ({
              name,
              missing: def.columns.filter((c) => !update.columns.includes(c)),
            }))
            .sort((a, b) => a.missing.length - b.missing.length)[0];
          if (best.missing.length === 0) continue;
          violations.push({
            rpc: rpc.name,
            file: rpc.file,
            level: LEVEL.TRANSITION_COVERAGE,
            kind: "missing-column",
            state: update.targetState,
            transition: best.name,
            columns: best.missing,
            key: `${rpc.name}:missing-column:${update.targetState}:${best.missing.join("+")}`,
            message:
              `moves an entry to '${update.targetState}' but does not write ` +
              `${best.missing.join(", ")}. Closest transition '${best.name}' in ` +
              `app/lib/queue-status.ts writes ` +
              `${candidates.find((c) => c.name === best.name).def.columns.join(", ")}; ` +
              `a row this RPC touches keeps stale values the TypeScript readers ` +
              `assume were cleared. If a WHERE guard already makes them correct, ` +
              `baseline it and name the guard.`,
          });
        }
      } else if (stateUpdates.length > 0) {
        notes.push(
          "queue_state is computed, not a literal — no single target state to " +
            "check coverage against",
        );
      } else {
        notes.push("writes campaign_queue but never queue_state");
      }
    } else {
      notes.push("reads campaign_queue only");
    }

    checked.push({ rpc: rpc.name, file: rpc.file, levels, notes, writes });
  }

  violations.sort((a, b) => a.key.localeCompare(b.key));
  return { violations, checked, vocabulary: [...vocabulary].sort() };
}

/**
 * Split violations against a baseline of known, reasoned, pre-existing drift.
 *
 * The ratchet shape check-effects / check-dry / check-type-safety already use:
 * `added` fails the build, and `stale` fails it too so a repaired violation
 * cannot sit in the baseline forever pretending to be debt.
 */
export function diffAgainstBaseline(violations, baseline) {
  // `$`-prefixed keys are documentation (the file's own how-to-use note), not
  // violation keys, and must not be reported as stale entries.
  const known = new Map(
    Object.entries(baseline ?? {}).filter(([key]) => !key.startsWith("$")),
  );
  const added = violations.filter((v) => !known.has(v.key));
  const seen = new Set(violations.map((v) => v.key));
  const stale = [...known.keys()].filter((key) => !seen.has(key)).sort();
  const carried = violations.filter((v) => known.has(v.key));
  return { added, stale, carried };
}

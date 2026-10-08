import postgres from "postgres";
import { beforeAll, describe, expect, test } from "vitest";

import {
  compareModelToDatabase,
  databaseUrl,
  driftKeys,
  freshEntries,
  recordedKeys,
  skipBanner,
  staleEntries,
  writeBaseline,
  type ModelComparison,
} from "../helpers/schema-drift";

/**
 * Every default the database supplies must be declared in the Drizzle model
 * (#2243).
 *
 * `app/db/schema*.ts` is hand-synced from the migration lineage, so it can
 * disagree with the database about more than types. This guard covers defaults,
 * which the sibling type guard (#2213) cannot see at all.
 *
 * ## The defect
 *
 * A column that is `NOT NULL DEFAULT now()` in the database but declared
 * `text().notNull()` in the model has no `.default()`, so Drizzle's
 * `InferInsertModel` marks it **required**. Every caller must then supply a
 * value the database was always going to supply, and the honest-looking fix at a
 * call site is to write the value by hand:
 *
 *   created_at: new Date().toISOString()
 *
 * That is a client clock instead of the database clock, and on a `text` column
 * it is the #2213 temporal drift arriving through a different door. #2242 fixed
 * the eleven live call sites; the columns themselves are this issue.
 *
 * ## Why nothing else found it
 *
 * `schema-type-drift.test.ts` compares `data_type`, and a column can be the
 * right type and still disagree about defaults. `tsc` cannot see it either: the
 * disagreement is "required versus optional", which is not a type error. Nothing
 * fails until a runtime insert omits the value.
 *
 * ## Modelling every default would be worse
 *
 * Some defaults exist only to let a NOT NULL column be inserted without a value.
 * They are migration scaffolding, not schema semantics, and inheriting them
 * turns a forgotten field into a silently wrong row:
 *
 *   transaction_history.amount  NOT NULL DEFAULT 0    → a ledger row worth nothing
 *   campaign_queue.attempts     NOT NULL DEFAULT 0    → retries that never happen
 *   rate_limit_bucket.count     NOT NULL DEFAULT 1    → a rate limit of one request
 *   outreach_attempt.workspace  NOT NULL DEFAULT gen_random_uuid()
 *                                                  → a row in no workspace
 *
 * So those stay required in the model — where the compiler enforces what the
 * application means — and are baselined here with the reason recorded.
 *
 * Everything else is a *rule* the application should inherit: `now()`, a
 * generated key, a documented config blob, an initial status. Those are modelled.
 *
 * ## Baseline
 *
 * `scripts/baselines/schema-default-drift.txt`, same shape and same two-way
 * ratchet as the type guard: a new exemption fails, and an exemption that is no
 * longer needed fails too, because a stale line would let the next real
 * regression on that column match it and pass.
 *
 * `EXEMPTION_REASONS` below is the part a regenerated baseline cannot hold. Every
 * baselined column needs a reason, and the test enforces it, so a line can never
 * exist without someone having written down why.
 *
 * Regenerate the baseline after changing the exemptions:
 *
 *   SCHEMA_DEFAULT_DRIFT_UPDATE=1 npm run test:integration-db
 *
 * The comparison, the model walk and the baseline handling live in
 * `test/helpers/schema-drift.ts`, shared with the type guard (#2213).
 */

const BASELINE_PATH = "scripts/baselines/schema-default-drift.txt";
const UPDATE = process.env.SCHEMA_DEFAULT_DRIFT_UPDATE === "1";

/**
 * Why each baselined column is deliberately left required.
 *
 * "scaffolding" — the default exists only to satisfy a NOT NULL constraint, and
 * inheriting it would let a forgotten value pass as a real one.
 *
 * "data value" — the default is a value from a row rather than a rule, so the
 * fix is a migration that drops it, not a model that copies it.
 */
const EXEMPTION_REASONS: Record<string, string> = {
  "campaign.caller_id": "scaffolding: NOT NULL DEFAULT ''",
  "campaign_queue.attempt_count": "scaffolding: NOT NULL DEFAULT 0",
  "campaign_queue.attempts": "scaffolding: NOT NULL DEFAULT 0",
  "outreach_attempt.workspace": "scaffolding: NOT NULL DEFAULT gen_random_uuid()",
  "rate_limit_bucket.count": "scaffolding: NOT NULL DEFAULT 1",
  "transaction_history.amount": "scaffolding: NOT NULL DEFAULT 0",
  "user.username": "scaffolding: NOT NULL DEFAULT ''",
  "workspace.credits": "scaffolding: NOT NULL DEFAULT 0",
  "workspace_invite.workspace": "scaffolding: NOT NULL DEFAULT gen_random_uuid()",
  "workspace.name":
    "data value: NOT NULL DEFAULT '''Test Workspace''::text'::text — a seeded row's " +
    "name, not a rule. Needs a migration to drop the default; see #2246.",

  // The model's `text()` against a jsonb default is a *type* lie, so this
  // belongs to #2213 rather than here. Copying it faithfully would mean
  // `.default("{}")`, which stores the two-character string `{}` on a text column
  // — correct by accident, and it would hide the type drift from the guard.
  "workspace.twilio_data": "type drift: jsonb default on a text column (#2213)",
};

/**
 * Reduce a Postgres default expression to the value it supplies, so the
 * placeholder test below reads a value rather than a rendering.
 *
 * `'0'::numeric` and `0` are the same default written two ways, and
 * `'{}'::jsonb` is not an empty string. Casting is stripped first, quoting
 * second, and doubled quotes are unescaped last — otherwise
 * `'''Test Workspace''::text'::text` would read as an empty string and be
 * mistaken for scaffolding when it is a seeded value.
 */
function defaultValue(expression: string): string {
  let value = expression.trim();

  for (;;) {
    const cast = value.match(/^(.*)::[a-z_][a-z_0-9 ]*(\[\])?$/i);
    if (!cast) break;
    value = cast[1].trim();
  }

  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

/**
 * True when the default is scaffolding rather than a rule.
 *
 * Three shapes, each a value no application should ever inherit by accident:
 *
 *   ""                an empty string on a NOT NULL column — a username, a caller id
 *   0                 a counter or balance that should start *unset*
 *   gen_random_uuid() a random identifier — safe on the table's own `id`, a silent
 *                     orphan on anything else
 *
 * **Zero only.** A nonzero number is a real default, not a placeholder: a call
 * that rings four times by default is a product decision the model should carry.
 * The same goes for `false` — "not the last one" is a real initial state, not a
 * stand-in for a value nobody supplied.
 *
 * `now()`, a generated key, a config blob and an initial status are all absent
 * from this list on purpose: they are the defaults an application genuinely
 * should inherit, and modelling them is the point of the issue.
 */
function isScaffolding(expression: string, columnName: string): boolean {
  const value = defaultValue(expression);
  if (value === "") return true;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) === 0;
  return value === "gen_random_uuid()" && columnName !== "id";
}

const client = databaseUrl() ? postgres(databaseUrl() as string, { max: 1 }) : null;

let comparison: ModelComparison;
/** `table.column: <database default>` for every default the model does not declare. */
const unmodelled: string[] = [];
/** The subset of `unmodelled` that is a deliberate exemption. */
const exempt: string[] = [];
/**
 * Why each exempt column is exempt: `scaffolding` when its own shape says so, or
 * `reasoned` when someone wrote the reason down. Keeps a baseline line and a
 * written reason in step, in both directions.
 */
const exemptionKind = new Map<string, "scaffolding" | "reasoned">();
/** Columns carrying a database default at all, for the report line. */
let withDefault = 0;

beforeAll(async () => {
  if (!client) {
    process.stderr.write(skipBanner("schema-default-drift"));
    comparison = await compareModelToDatabase(null);
    return;
  }

  comparison = await compareModelToDatabase(client);

  for (const column of comparison.columns) {
    if (column.dbDefault === null) continue;
    withDefault += 1;
    if (column.drizzleDefault !== null) continue;

    const line = `${column.key}: ${column.dbDefault}`;
    unmodelled.push(line);

    const columnName = column.key.slice(column.key.indexOf(".") + 1);
    if (isScaffolding(column.dbDefault, columnName)) {
      exempt.push(line);
      exemptionKind.set(column.key, "scaffolding");
    } else if (EXEMPTION_REASONS[column.key]) {
      exempt.push(line);
      exemptionKind.set(column.key, "reasoned");
    }
  }

  unmodelled.sort();
  exempt.sort();
});

describe("every database default is declared in the Drizzle model (#2243)", () => {
  test("the comparison set is not vacuous", () => {
    if (comparison.skipReason) return;
    // The type guard asserts on columns compared; this one has to assert that it
    // actually *found* defaults to compare, or an empty result would pass for a
    // correct model when it means a broken query.
    expect(
      withDefault,
      `only ${withDefault} column(s) carry a database default. That is implausibly ` +
        `few — this guard may be comparing nothing, which would let it pass while ` +
        `proving nothing.`,
    ).toBeGreaterThan(100);
  });

  test.skipIf(UPDATE)("no default goes unmodelled except the scaffolding", () => {
    if (comparison.skipReason) return;
    // `freshEntries` rather than a plain `unmodelled` comparison: the baseline
    // holds the exemptions, so what must be empty is "unmodelled and not already
    // accepted".
    const fresh = freshEntries(unmodelled, BASELINE_PATH);

    expect(
      fresh,
      fresh.length
        ? `${fresh.length} column(s) are defaulted in the database and undeclared in the ` +
            `model, so InferInsertModel marks them required and every caller has to invent a ` +
            `value the database was going to supply.\n` +
            `Add .default(...) to app/db/schema*.ts. Use sql\`...\` inside .default() for an ` +
            `expression, and copy the database's own default rather than a convenient ` +
            `constant — a hand-picked constant is the same lie in a different place.\n` +
            `If the default is scaffolding (a 0, an empty string, a random uuid on a ` +
            `foreign key), regenerate the baseline with SCHEMA_DEFAULT_DRIFT_UPDATE=1 and ` +
            `give it a reason in EXEMPTION_REASONS.`
        : "",
    ).toEqual([]);
  });

  test.skipIf(UPDATE)("no baselined exemption is stale", () => {
    if (comparison.skipReason) return;
    // Compared against every unmodelled default, not just the exempt ones: a
    // baselined column that the model now declares, or whose default the database
    // dropped, has stopped needing the exemption.
    const stale = staleEntries(BASELINE_PATH, driftKeys(unmodelled));

    expect(
      stale,
      stale.length
        ? `${stale.length} baselined column(s) no longer need an exemption — either the ` +
            `model now declares the default or the database dropped it. Remove them from ` +
            `${BASELINE_PATH} and from EXEMPTION_REASONS: a stale entry would let the next ` +
            `real regression on that column match it and pass.`
        : "",
    ).toEqual([]);
  });

  test.skipIf(UPDATE)("the scaffolding test and the baseline agree", () => {
    if (comparison.skipReason) return;
    const baselined = new Set(recordedKeys(BASELINE_PATH));

    // A scaffolding default that is not baselined will fail the test above, which
    // is correct — but the failure message would not say it was recognised as
    // scaffolding. Asserting the shape here turns that into one clear message.
    const unbaselinedScaffolding = exempt.filter(
      (line) => !baselined.has(line.slice(0, line.indexOf(":"))),
    );

    expect(
      unbaselinedScaffolding,
      unbaselinedScaffolding.length
        ? `These are recognised as scaffolding but are not baselined:\n` +
            `${unbaselinedScaffolding.join("\n")}\n` +
            `Regenerate the baseline with SCHEMA_DEFAULT_DRIFT_UPDATE=1.`
        : "",
    ).toEqual([]);
  });

  test.skipIf(UPDATE)("every exemption is accounted for", () => {
    if (comparison.skipReason) return;
    const recorded = new Set(recordedKeys(BASELINE_PATH));

    // A scaffolding default's shape *is* its reason, so it needs nothing written
    // down. Anything exempt for another reason must say what it is.
    const undocumented = [...recorded].filter(
      (key) => exemptionKind.get(key) === "reasoned" && !EXEMPTION_REASONS[key],
    );
    // And a reason with no baseline line is a decision that does nothing.
    const orphaned = Object.keys(EXEMPTION_REASONS).filter((key) => !recorded.has(key));

    expect(
      { undocumented, orphaned },
      undocumented.length || orphaned.length
        ? `An exemption is either undocumented or does nothing. A scaffolding default ` +
            `needs no reason — its shape is the reason — but anything else must be ` +
            `written down in EXEMPTION_REASONS, and every reason there must have a ` +
            `baseline line.\n` +
            `Exempt with no reason: ${undocumented.join(", ") || "none"}.\n` +
            `Reason with no baseline line: ${orphaned.join(", ") || "none"}.`
        : "",
    ).toEqual({ undocumented: [], orphaned: [] });
  });

  test("report", () => {
    if (comparison.skipReason) return;
    if (UPDATE) {
      // Only the exemptions are written. Writing the full unmodelled set would let
      // a single UPDATE bless every new drift in the model.
      writeBaseline(BASELINE_PATH, exempt);
      process.stderr.write(
        `\nschema-default-drift baseline written: ${exempt.length} exemption(s).\n`,
      );
      return;
    }
    // Printed on every run, so the count is never a claim in an issue body that
    // nobody re-measured.
    process.stderr.write(
      `\nschema-default-drift: compared ${comparison.compared} columns; ` +
        `${withDefault} carry a database default, ${unmodelled.length} unmodelled of which ` +
        `${exempt.length} are exempt (${comparison.absent} absent from this database).\n`,
    );
  });
});
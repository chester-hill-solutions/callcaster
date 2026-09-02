/* eslint-env node */
/**
 * Does every pgEnum value in app/db/*.ts exist in the enum the repo SQL builds?
 *
 * app/db/schema.ts is hand-synced (see drizzle.config.ts) and nothing ever
 * generated DDL from it, so a value added to a pgEnum there is a promise the
 * migrations may never keep. #1168 added 'waiting' to campaign_status that
 * way: the app started writing `status in ('running', 'waiting')`, no lineage
 * ever ran `ALTER TYPE campaign_status ADD VALUE 'waiting'`, and the
 * campaign_schedule_sync job dead-lettered every minute in production and dev
 * for weeks (#1476). Every other gate looked at functions and tables; none
 * compared enum VALUES.
 *
 * This is pure text extraction over two sources, no database:
 *   - schema side: `pgEnum("name", [...])` calls in SCHEMA_FILES.
 *   - SQL side: `CREATE TYPE ... AS ENUM (...)`, `ALTER TYPE ... ADD VALUE`,
 *     `ALTER TYPE ... RENAME TO` and `ALTER TYPE ... RENAME VALUE` across
 *     drizzle/*.sql then client/migrations/*.sql, each in filename order.
 *
 * SQL values are a UNION over the whole lineage. That is deliberate: the two
 * bootstraps interleave drizzle/ and client/migrations/ and the boot runner
 * skips files the baseline already covers, so no single order is "the" order.
 * A union answers the only question this gate asks — is there ANY statement
 * that creates this value — and a DROP TYPE that removes a schema enum is the
 * live-database drift checker's job (scripts/db/check-schema-drift.mjs).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SCHEMA_FILES } from "./app-db-objects.mjs";
import { stripSqlComments } from "./queue-rpc-contract.mjs";

/** SQL that builds the schema on every lineage, in the order it is read. */
export const ENUM_LINEAGE_DIRS = ["drizzle", "client/migrations"];

const PG_ENUM_RE = /pgEnum\(\s*"([^"]+)"\s*,\s*\[([^\]]*)\]/g;
const TS_STRING_RE = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

/** `public.foo`, `"foo"`, `public."foo"` → `foo`. */
function bareTypeName(raw) {
  return raw.replace(/^public\./i, "").replace(/"/g, "").toLowerCase();
}

/** Every `'literal'` in a SQL list, with `''` unescaped. */
function sqlLiterals(list) {
  return [...list.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

const IDENT = String.raw`((?:public\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)`;
const CREATE_ENUM_RE = new RegExp(
  String.raw`\bCREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}\s+AS\s+ENUM\s*\(([^)]*)\)`,
  "gi",
);
const ADD_VALUE_RE = new RegExp(
  String.raw`\bALTER\s+TYPE\s+${IDENT}\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?('(?:[^']|'')*')`,
  "gi",
);
const RENAME_TYPE_RE = new RegExp(
  String.raw`\bALTER\s+TYPE\s+${IDENT}\s+RENAME\s+TO\s+${IDENT}`,
  "gi",
);
const RENAME_VALUE_RE = new RegExp(
  String.raw`\bALTER\s+TYPE\s+${IDENT}\s+RENAME\s+VALUE\s+('(?:[^']|'')*')\s+TO\s+('(?:[^']|'')*')`,
  "gi",
);

/**
 * `pgEnum("name", [...])` declarations in one TypeScript source.
 * @param {string} source
 * @returns {Map<string, string[]>} enum name → declared values
 */
export function parseSchemaEnums(source) {
  const enums = new Map();
  for (const m of source.matchAll(PG_ENUM_RE)) {
    const values = [...m[2].matchAll(TS_STRING_RE)].map((s) => s[1] ?? s[2]);
    enums.set(m[1], values);
  }
  return enums;
}

/**
 * Apply one SQL file's enum DDL, in statement order, onto `enums`.
 * @param {string} sql raw file content (comments are stripped here)
 * @param {Map<string, Set<string>>} enums accumulator, mutated
 */
export function applyEnumDdl(sql, enums = new Map()) {
  const bare = stripSqlComments(sql);
  const events = [];
  for (const m of bare.matchAll(CREATE_ENUM_RE)) {
    events.push({ at: m.index, run: () => union(enums, bareTypeName(m[1]), sqlLiterals(m[2])) });
  }
  for (const m of bare.matchAll(ADD_VALUE_RE)) {
    events.push({ at: m.index, run: () => union(enums, bareTypeName(m[1]), sqlLiterals(m[2])) });
  }
  for (const m of bare.matchAll(RENAME_TYPE_RE)) {
    events.push({
      at: m.index,
      run: () => {
        const from = bareTypeName(m[1]);
        const to = bareTypeName(m[2]);
        const values = enums.get(from);
        if (!values) return;
        enums.delete(from);
        union(enums, to, [...values]);
      },
    });
  }
  for (const m of bare.matchAll(RENAME_VALUE_RE)) {
    events.push({
      at: m.index,
      run: () => {
        const name = bareTypeName(m[1]);
        const [from] = sqlLiterals(m[2]);
        const [to] = sqlLiterals(m[3]);
        const values = enums.get(name);
        if (!values) return;
        values.delete(from);
        values.add(to);
      },
    });
  }
  events.sort((a, b) => a.at - b.at);
  for (const event of events) event.run();
  return enums;
}

function union(enums, name, values) {
  const set = enums.get(name) ?? new Set();
  for (const value of values) set.add(value);
  enums.set(name, set);
}

/**
 * Enum values every lineage's SQL creates, by type name.
 * @param {string} root repo root
 * @param {string[]} dirs
 * @returns {Map<string, Set<string>>}
 */
export function collectSqlEnums(root, dirs = ENUM_LINEAGE_DIRS) {
  const enums = new Map();
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(join(root, dir)).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      applyEnumDdl(readFileSync(join(root, dir, name), "utf8"), enums);
    }
  }
  return enums;
}

/**
 * pgEnum declarations across every schema file the app compiles against.
 * @param {string} root repo root
 * @param {string[]} files
 * @returns {Map<string, {file: string, values: string[]}>}
 */
export function collectSchemaEnums(root, files = SCHEMA_FILES) {
  const enums = new Map();
  for (const file of files) {
    let source;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    for (const [name, values] of parseSchemaEnums(source)) {
      enums.set(name, { file, values });
    }
  }
  return enums;
}

/**
 * @typedef {{ enum: string, file: string, value: string | null }} EnumGap
 *   `value` is null when the SQL never creates the type at all.
 */

/**
 * Schema-declared enum values with no CREATE TYPE / ADD VALUE in the SQL.
 * @param {Map<string, {file: string, values: string[]}>} schemaEnums
 * @param {Map<string, Set<string>>} sqlEnums
 * @returns {EnumGap[]}
 */
export function diffEnums(schemaEnums, sqlEnums) {
  const gaps = [];
  for (const [name, { file, values }] of schemaEnums) {
    const created = sqlEnums.get(name.toLowerCase());
    if (!created) {
      gaps.push({ enum: name, file, value: null });
      continue;
    }
    for (const value of values) {
      if (!created.has(value)) gaps.push({ enum: name, file, value });
    }
  }
  return gaps;
}

/**
 * The whole check for a repo root: schema.ts enums minus what the SQL builds.
 * @param {string} root
 * @returns {{ gaps: EnumGap[], schemaEnums: Map<string, {file: string, values: string[]}>, sqlEnums: Map<string, Set<string>> }}
 */
export function checkSchemaEnums(root) {
  const schemaEnums = collectSchemaEnums(root);
  const sqlEnums = collectSqlEnums(root);
  return { gaps: diffEnums(schemaEnums, sqlEnums), schemaEnums, sqlEnums };
}

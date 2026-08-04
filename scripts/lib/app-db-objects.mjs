/* eslint-env node */
/**
 * What database objects does the application actually require?
 *
 * Shared by the two checks that answer different halves of that question:
 *   - `check-db-rpcs.mjs`      — is every called function created by repo SQL?
 *   - `check-schema-drift.mjs` — does a given live database actually have them?
 *
 * Both need the same extraction, and it must not be written twice: the whole
 * reason these checks exist is that two sources of truth about the schema
 * silently diverged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Directories containing application code that talks to Postgres. */
export const APP_DIRS = ["app", "worker", "services"];

/** SQL in the repo that builds the schema. */
export const SQL_DIRS = ["drizzle", "client/migrations", "scripts/schema-transform"];

/** Drizzle table definitions the app compiles against. */
export const SCHEMA_FILES = [
  "app/db/schema.ts",
  "app/db/auth-schema.ts",
  "app/db/schema-transcription.ts",
];

/**
 * Not RPCs — SQL built-ins and Postgres functions the app calls directly. A
 * name here is never reported as missing.
 */
export const SQL_BUILTINS = new Set([
  "count", "now", "sum", "min", "max", "avg", "coalesce", "nullif", "greatest",
  "least", "jsonb_build_object", "json_build_object", "to_jsonb", "array_agg",
  "jsonb_agg", "make_interval", "date_trunc", "extract", "generate_series",
  "unnest", "lower", "upper", "trim", "concat", "length", "cast", "exists",
  "row_number", "regexp_replace", "string_agg", "pg_sleep", "distinct", "case",
  "nextval", "currval", "setval", "gen_random_uuid", "uuid_generate_v4", "any",
  "pg_notify", "pg_advisory_xact_lock", "pg_advisory_lock", "set_config",
  "current_setting", "pg_try_advisory_lock", "to_regclass",
]);

export function walk(dir, out = [], exts = [".ts", ".tsx"]) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out, exts);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Function names the app invokes, mapped to the files invoking them.
 *
 * Two call shapes exist and both must be covered: sql`...` templates, and the
 * Supabase-style `.rpc("name")` that survives in the campaign-dispatch modules.
 * Matching only the former left nine functions unchecked.
 */
export function collectCalledRpcs(root) {
  const called = new Map();
  for (const dir of APP_DIRS) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, "utf8");
      // Supabase-style `.rpc("name", ...)` survives in the campaign-dispatch
      // modules. These are invisible to the sql`` scan below, so a function
      // called only this way could go missing exactly as
      // claim_next_queue_contact did.
      for (const m of src.matchAll(/\.rpc\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi)) {
        const name = m[1].toLowerCase();
        if (SQL_BUILTINS.has(name)) continue;
        if (!called.has(name)) called.set(name, new Set());
        called.get(name).add(file.slice(root.length + 1));
      }

      for (const tpl of src.match(/sql`[^`]*`/gs) ?? []) {
        for (const m of tpl.matchAll(
          /\b(?:from|select|call|perform)\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
        )) {
          const name = m[1].toLowerCase();
          if (SQL_BUILTINS.has(name)) continue;
          if (!called.has(name)) called.set(name, new Set());
          called.get(name).add(file.slice(root.length + 1));
        }
      }
    }
  }
  return called;
}

/** Function names created by SQL anywhere in the repo. */
export function collectCreatedFunctions(root) {
  const created = new Set();
  for (const dir of SQL_DIRS) {
    for (const file of walk(join(root, dir), [], [".sql"])) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi,
      )) {
        created.add(m[1].toLowerCase());
      }
    }
  }
  return created;
}

/**
 * Tables and their database column names from the Drizzle schema.
 *
 * A column's database name is the explicit first string argument when present
 * (`emailVerified: boolean("email_verified")`) and otherwise the property key.
 * Getting this wrong reports every camelCase Better Auth column as missing.
 */
export function collectSchemaTables(root) {
  const tables = new Map();
  for (const relPath of SCHEMA_FILES) {
    let src;
    try {
      src = readFileSync(join(root, relPath), "utf8");
    } catch {
      continue;
    }
    const tableRe = /pgTable\(\s*\n?\s*"([a-z_0-9]+)"\s*,\s*\{([\s\S]*?)\n\s*\}\s*[,)]/g;
    let match;
    while ((match = tableRe.exec(src))) {
      const [, tableName, body] = match;
      const columns = [];
      const colRe =
        /^\s{2,}(?:\/\*\*[\s\S]*?\*\/\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_]+)\s*\(\s*("([^"]+)")?/gm;
      let col;
      while ((col = colRe.exec(body))) {
        const [, key, , , explicitName] = col;
        if (["columns", "where", "with", "extras"].includes(key)) continue;
        columns.push(explicitName ?? key);
      }
      tables.set(tableName, [...new Set(columns)]);
    }
  }
  return tables;
}

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { collectCurrentFunctionDefinitions } from "../scripts/lib/queue-rpc-contract.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DROP_MIGRATION = "20260922120000_drop_legacy_auth_schema.sql";
const SHIM = "drizzle/0001_auth_uid_shim.sql";

/**
 * Chunk-3 guard (#1885): once the legacy Supabase `auth` schema is dropped,
 * nothing may reference it again. A new migration importing `auth.*` into a
 * public function body (or recreating the schema via the shim) must fail here
 * before it can be shipped.
 */
describe("legacy auth schema guard (#1885 chunk 3)", () => {
  test("no latest public/app_auth function definition references auth.*", () => {
    const defs = collectCurrentFunctionDefinitions(ROOT);
    const offenders = [...defs.entries()].filter(
      ([name, def]) => !name.startsWith("auth.") && /\bauth\./.test(def.sql),
    );
    expect(offenders).toEqual([]);
  });

  test("the auth schema is dropped last in the client migration lineage", () => {
    const files = readdirSync(path.join(ROOT, "client/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files[files.length - 1]).toBe(DROP_MIGRATION);
  });

  test("the legacy auth.uid() shim is retired and defines nothing", () => {
    const shim = readFileSync(path.join(ROOT, SHIM), "utf8");
    expect(shim).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
  });

  test("the drop migration fails closed before DROP CASCADE", () => {
    const sql = readFileSync(path.join(ROOT, `client/migrations/${DROP_MIGRATION}`), "utf8");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toMatch(/still reference auth/);
    expect(sql).toContain("DROP SCHEMA IF EXISTS auth CASCADE");
  });

  test("both bootstrap step lists apply the drop migration", () => {
    for (const script of [
      "scripts/db/bootstrap-fresh-db.mjs",
      "scripts/e2e/bootstrap-compose-db.mjs",
    ]) {
      const src = readFileSync(path.join(ROOT, script), "utf8");
      expect(src).toContain(DROP_MIGRATION);
    }
  });
});
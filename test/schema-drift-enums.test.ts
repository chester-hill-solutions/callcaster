/**
 * #1475 — enum drift coverage for `db:schema:check`.
 *
 * The check script itself needs a live database and stays untested, as the
 * other scripts/db checks do. What is pinned here is the pure half: parsing
 * `pgEnum(...)` declarations out of the Drizzle schema, and the comparison of
 * expected versus actual value lists. Both must stay correct for the script
 * to mean anything, and a parser that silently returns nothing is exactly
 * the failure mode that let `'waiting'` go unnoticed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

// Plain .mjs gate helper — tsconfig excludes *.test.ts, so no shim is needed.
import { collectSchemaEnums, diffEnums } from "../scripts/lib/app-db-objects.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

const enumMap = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe("collectSchemaEnums", () => {
  const scratch: string[] = [];
  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A throwaway repo root containing only app/db/schema.ts with the given source. */
  function fakeRoot(schemaSource: string) {
    const root = mkdtempSync(path.join(tmpdir(), "schema-drift-enums-"));
    scratch.push(root);
    mkdirSync(path.join(root, "app/db"), { recursive: true });
    writeFileSync(path.join(root, "app/db/schema.ts"), schemaSource);
    return root;
  }

  test("maps the database type name (not the binding) to its values in declared order", () => {
    const root = fakeRoot(
      `export const workspace_role = pgEnum("workspace_users_role", ["owner","member","caller","admin"]);\n`,
    );
    const enums = collectSchemaEnums(root) as Map<string, string[]>;
    expect([...enums.keys()]).toEqual(["workspace_users_role"]);
    expect(enums.get("workspace_users_role")).toEqual(["owner", "member", "caller", "admin"]);
  });

  test("tolerates multi-line declarations, single quotes and trailing commas", () => {
    const root = fakeRoot(`
export const call_status = pgEnum(
  "call_status",
  [
    'queued',
    "in-progress",
    'no-answer',
  ],
);
`);
    const enums = collectSchemaEnums(root) as Map<string, string[]>;
    expect(enums.get("call_status")).toEqual(["queued", "in-progress", "no-answer"]);
  });

  test("returns an empty map when no schema file exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "schema-drift-enums-empty-"));
    scratch.push(root);
    expect((collectSchemaEnums(root) as Map<string, string[]>).size).toBe(0);
  });

  /**
   * The real schema, as the check script sees it. If a refactor of schema.ts
   * defeats the extractor, the script would parse zero enums and exit 2 — but
   * a partial miss would pass silently, so pin the one enum that started this.
   */
  test("reads the real schema, including campaign_status.waiting", () => {
    const enums = collectSchemaEnums(ROOT) as Map<string, string[]>;
    expect(enums.size).toBeGreaterThanOrEqual(10);
    expect(enums.get("campaign_status")).toContain("waiting");
    expect(enums.get("workspace_users_role")).toEqual(["owner", "member", "caller", "admin"]);
  });
});

describe("diffEnums", () => {
  test("reports nothing when the database matches the schema", () => {
    const expected = enumMap({ campaign_status: ["pending", "running", "waiting"] });
    const actual = enumMap({ campaign_status: ["pending", "running", "waiting"] });
    expect(diffEnums(expected, actual)).toEqual({
      missingEnums: [],
      missingValues: [],
      extraValues: [],
    });
  });

  test("a value in schema.ts but not in the database is missing (fails the check)", () => {
    const expected = enumMap({
      campaign_status: ["pending", "scheduled", "running", "waiting"],
    });
    const actual = enumMap({ campaign_status: ["pending", "scheduled", "running"] });
    expect(diffEnums(expected, actual)).toEqual({
      missingEnums: [],
      missingValues: [{ name: "campaign_status", values: ["waiting"] }],
      extraValues: [],
    });
  });

  test("a value only the database has is extra (warns), not missing", () => {
    const expected = enumMap({ queue_status: ["queued", "dequeued"] });
    const actual = enumMap({ queue_status: ["queued", "dequeued", "legacy"] });
    expect(diffEnums(expected, actual)).toEqual({
      missingEnums: [],
      missingValues: [],
      extraValues: [{ name: "queue_status", values: ["legacy"] }],
    });
  });

  test("an enum type absent from the database is reported once, not per value", () => {
    const expected = enumMap({ dial_types: ["call", "predictive"] });
    const actual = enumMap({});
    expect(diffEnums(expected, actual)).toEqual({
      missingEnums: ["dial_types"],
      missingValues: [],
      extraValues: [],
    });
  });

  test("order does not matter; drift in both directions is reported for one enum", () => {
    const expected = enumMap({ answered_by: ["human", "machine", "unknown"] });
    const actual = enumMap({ answered_by: ["unknown", "human", "fax"] });
    expect(diffEnums(expected, actual)).toEqual({
      missingEnums: [],
      missingValues: [{ name: "answered_by", values: ["machine"] }],
      extraValues: [{ name: "answered_by", values: ["fax"] }],
    });
  });

  test("enum types only the database has are ignored (the app does not use them)", () => {
    const expected = enumMap({ dial_types: ["call", "predictive"] });
    const actual = enumMap({ dial_types: ["call", "predictive"], audit_kind: ["a"] });
    expect(diffEnums(expected, actual).extraValues).toEqual([]);
  });
});

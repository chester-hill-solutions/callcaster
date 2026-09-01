import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  applyEnumDdl,
  checkSchemaEnums,
  collectSqlEnums,
  diffEnums,
  parseSchemaEnums,
} from "../scripts/lib/schema-enums.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * app/db/schema.ts is hand-synced and never generates DDL, so a value added
 * to a pgEnum there is only a promise. #1168 added 'waiting' to
 * campaign_status in schema.ts alone; no migration ever ran ADD VALUE, and
 * the campaign_schedule_sync job dead-lettered every minute in production
 * (#1476). This suite pins the static gate that now fails CI on that drift
 * (scripts/db/check-schema-enums.mjs) and the parser it rests on.
 */
describe("schema-enums parser", () => {
  test("reads pgEnum declarations from TypeScript source", () => {
    const enums = parseSchemaEnums(`
      export const a = pgEnum("campaign_status", ["pending","running", 'waiting']);
      export const b = pgEnum(
        "dial_types",
        ["call", "predictive"],
      );
    `);
    expect(enums.get("campaign_status")).toEqual(["pending", "running", "waiting"]);
    expect(enums.get("dial_types")).toEqual(["call", "predictive"]);
  });

  test("unions CREATE TYPE and ADD VALUE, ignores comments, handles IF NOT EXISTS", () => {
    const enums = applyEnumDdl(`
      -- ALTER TYPE public.campaign_status ADD VALUE 'from_a_comment';
      CREATE TYPE public.campaign_status AS ENUM (
          'pending',
          'running'
      );
      /* ALTER TYPE campaign_status ADD VALUE 'from_block_comment'; */
      ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'waiting';
      alter type campaign_status add value 'paused' before 'running';
      CREATE TYPE IF NOT EXISTS "dial_types" AS ENUM ('call', 'it''s');
    `);
    expect([...enums.get("campaign_status")!]).toEqual(["pending", "running", "waiting", "paused"]);
    expect([...enums.get("dial_types")!]).toEqual(["call", "it's"]);
  });

  test("follows ALTER TYPE ... RENAME TO and RENAME VALUE in statement order", () => {
    const enums = applyEnumDdl(`
      CREATE TYPE public.workspace_role AS ENUM ('owner', 'member');
      ALTER TYPE public.workspace_role ADD VALUE 'caller';
      ALTER TYPE public.workspace_role RENAME TO workspace_users_role;
      ALTER TYPE public.workspace_users_role RENAME VALUE 'member' TO 'agent';
    `);
    expect(enums.has("workspace_role")).toBe(false);
    expect([...enums.get("workspace_users_role")!]).toEqual(["owner", "caller", "agent"]);
  });

  test("a value only in schema.ts is reported as a gap; a type never created is too", () => {
    const schema = parseSchemaEnums(
      `pgEnum("campaign_status", ["running","waiting"]); pgEnum("ghost", ["x"]);`,
    );
    const schemaEnums = new Map(
      [...schema].map(([name, values]) => [name, { file: "app/db/schema.ts", values }]),
    );
    const sql = applyEnumDdl(`CREATE TYPE campaign_status AS ENUM ('running');`);
    expect(diffEnums(schemaEnums, sql)).toEqual([
      { enum: "campaign_status", file: "app/db/schema.ts", value: "waiting" },
      { enum: "ghost", file: "app/db/schema.ts", value: null },
    ]);
  });
});

describe("app/db pgEnums vs drizzle/ + client/migrations/", () => {
  test("the lineage creates campaign_status.'waiting' (#1476 regression)", () => {
    const sql = collectSqlEnums(ROOT);
    expect(sql.get("campaign_status")?.has("waiting")).toBe(true);
  });

  test("every schema.ts pgEnum value is created by some migration", () => {
    const { gaps, schemaEnums } = checkSchemaEnums(ROOT);
    expect(schemaEnums.size).toBeGreaterThan(0);
    expect(gaps).toEqual([]);
  });
});

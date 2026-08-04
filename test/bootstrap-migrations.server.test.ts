import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

/** Mutable state the postgres mock reads, reset per test. */
const dbState = vi.hoisted(() => ({
  legacyTriggers: [] as { tgname: string }[],
  appliedRows: [] as { filename: string }[],
  inserted: [] as string[],
  simpleApplied: [] as string[],
  factoryCalls: 0,
  failSimpleOnce: false,
}));

vi.mock("postgres", () => {
  function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    if (text.includes("pg_trigger")) return Promise.resolve(dbState.legacyTriggers);
    if (text.includes("from public.client_migration_bootstrap")) {
      return Promise.resolve(dbState.appliedRows);
    }
    if (text.includes("insert into public.client_migration_bootstrap")) {
      dbState.inserted.push(String(values[0]));
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }
  (sqlTag as unknown as { unsafe: (s: string) => Promise<unknown[]> & { simple: () => Promise<unknown[]> } }).unsafe = (
    s: string,
  ) => {
    const p = Promise.resolve([]) as Promise<unknown[]> & { simple: () => Promise<unknown[]> };
    p.simple = () => {
      if (dbState.failSimpleOnce && s !== "ROLLBACK") {
        dbState.failSimpleOnce = false;
        dbState.simpleApplied.push(s);
        return Promise.reject(new Error("relation \"cron.job\" does not exist"));
      }
      dbState.simpleApplied.push(s);
      return Promise.resolve([]);
    };
    return p;
  };
  (sqlTag as unknown as { end: () => Promise<void> }).end = () => Promise.resolve();
  return {
    default: vi.fn(() => {
      dbState.factoryCalls += 1;
      return sqlTag;
    }),
  };
});

vi.mock("@/lib/logger.server", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  applyClientMigrationsOnBoot,
  bootstrapEnabled,
} from "../app/server/bootstrap-migrations.server";

describe("bootstrap-migrations.server", () => {
  beforeEach(() => {
    dbState.legacyTriggers = [];
    dbState.appliedRows = [];
    dbState.inserted = [];
    dbState.simpleApplied = [];
    dbState.factoryCalls = 0;
    dbState.failSimpleOnce = false;
  });

  test("bootstrapEnabled only true for explicit opt-in", () => {
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "1" })).toBe(true);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "true" })).toBe(true);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "0" })).toBe(false);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "yes" })).toBe(false);
    expect(bootstrapEnabled({})).toBe(false);
  });

  test("does nothing (never connects) when the flag is off", async () => {
    const result = await applyClientMigrationsOnBoot({
      env: { DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result).toEqual({ ran: false, reason: "disabled" });
    expect(dbState.factoryCalls).toBe(0);
  });

  test("returns no-database-url when enabled without DATABASE_URL", async () => {
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1" },
      rootDir: ROOT_DIR,
    });
    expect(result).toEqual({ ran: false, reason: "no-database-url" });
    expect(dbState.factoryCalls).toBe(0);
  });

  test("refuses to touch a legacy database and applies nothing", async () => {
    dbState.legacyTriggers = [{ tgname: "transaction_history_update_credits" }];
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result).toEqual({
      ran: false,
      reason: "legacy-database",
      triggers: ["transaction_history_update_credits"],
    });
    expect(dbState.simpleApplied).toHaveLength(0);
    expect(dbState.inserted).toHaveLength(0);
  });

  test("applies every pending migration on a fresh database", async () => {
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    // Real client/migrations directory drives this — every file applies + records.
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.skipped).toHaveLength(0);
    expect(dbState.inserted).toEqual(result.applied);
    // Applied in sorted (version-prefixed) filename order.
    expect(result.applied).toEqual([...result.applied].sort());
  });

  test("skips migrations already recorded as applied", async () => {
    // Pretend the first two files (sorted) are already applied.
    const result0 = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    if (!result0.ran) throw new Error("expected first run to apply");
    const [firstApplied] = result0.applied;

    dbState.appliedRows = [{ filename: firstApplied }];
    dbState.inserted = [];
    dbState.simpleApplied = [];

    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    if (!result.ran) throw new Error("expected second run to apply");
    expect(result.skipped).toContain(firstApplied);
    expect(result.applied).not.toContain(firstApplied);
    expect(dbState.inserted).not.toContain(firstApplied);
  });

  test("rolls back an aborted transaction so later files can still apply", async () => {
    dbState.failSimpleOnce = true;
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(dbState.simpleApplied).toContain("ROLLBACK");
    // First migration failed + rolled back; later files still recorded.
    expect(dbState.inserted.length).toBe(result.applied.length);
  });
});

import path from "node:path";
import { EventEmitter } from "node:events";
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
  events: [] as string[],
  // App schema present by default (managed DBs) — existing tests keep their
  // exact event sequences; baseline tests flip this to simulate a PR preview.
  schemaPresent: true,
  seedTableExists: false,
  spawnCalls: [] as unknown[][],
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => {
    dbState.spawnCalls.push(args);
    const proc = new EventEmitter();
    setTimeout(() => proc.emit("exit", 0), 0);
    return proc;
  },
}));

vi.mock("postgres", () => {
  function sqlTag(strings: TemplateStringsArray, ...values: unknown[]) {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    if (text.includes("pg_advisory_unlock")) {
      dbState.events.push("unlock");
      return Promise.resolve([]);
    }
    if (text.includes("pg_advisory_lock")) {
      dbState.events.push("lock");
      return Promise.resolve([]);
    }
    if (text.includes("pg_trigger")) {
      dbState.events.push("legacy-check");
      return Promise.resolve(dbState.legacyTriggers);
    }
    if (text.includes("to_regclass('public.workspace')")) {
      dbState.events.push("schema-check");
      return Promise.resolve([{ t: dbState.schemaPresent ? "workspace" : null }]);
    }
    if (text.includes("to_regclass('public.e2e_seed_bootstrap')")) {
      dbState.events.push("seed-check");
      return Promise.resolve([
        { t: dbState.seedTableExists ? "e2e_seed_bootstrap" : null },
      ]);
    }
    if (text.includes("from public.client_migration_bootstrap")) {
      dbState.events.push("read-applied");
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
  (sqlTag as unknown as { end: () => Promise<void> }).end = () => {
    dbState.events.push("end");
    return Promise.resolve();
  };
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
  e2eSeedEnabled,
} from "../app/server/bootstrap-migrations.server";

describe("bootstrap-migrations.server", () => {
  beforeEach(() => {
    dbState.legacyTriggers = [];
    dbState.appliedRows = [];
    dbState.inserted = [];
    dbState.simpleApplied = [];
    dbState.factoryCalls = 0;
    dbState.failSimpleOnce = false;
    dbState.events = [];
    dbState.schemaPresent = true;
    dbState.seedTableExists = false;
    dbState.spawnCalls = [];
  });

  test("bootstrapEnabled only true for explicit opt-in", () => {
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "1" })).toBe(true);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "true" })).toBe(true);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "0" })).toBe(false);
    expect(bootstrapEnabled({ RUN_CLIENT_MIGRATIONS_ON_BOOT: "yes" })).toBe(false);
    expect(bootstrapEnabled({})).toBe(false);
  });

  test("e2eSeedEnabled only true for explicit opt-in", () => {
    expect(e2eSeedEnabled({ E2E_SEED_ON_BOOT: "1" })).toBe(true);
    expect(e2eSeedEnabled({ E2E_SEED_ON_BOOT: "true" })).toBe(true);
    expect(e2eSeedEnabled({ E2E_SEED_ON_BOOT: "0" })).toBe(false);
    expect(e2eSeedEnabled({})).toBe(false);
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

  test("holds one advisory lock from before the first read until after the last file", async () => {
    dbState.failSimpleOnce = true;
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    expect(dbState.events[0]).toBe("lock");
    expect(dbState.events.indexOf("lock")).toBeLessThan(dbState.events.indexOf("read-applied"));
    expect(dbState.events.filter((e) => e === "lock")).toHaveLength(1);
    // Released once, after everything, and before the connection closes.
    expect(dbState.events.slice(-2)).toEqual(["unlock", "end"]);
  });

  test("releases the lock when it refuses a legacy database", async () => {
    dbState.legacyTriggers = [{ tgname: "outreach_trigger" }];
    await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(dbState.events).toEqual(["lock", "legacy-check", "unlock", "end"]);
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

  test("bootstraps the drizzle baseline when the app schema is missing", async () => {
    dbState.schemaPresent = false;
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    // Every drizzle baseline file applied (fresh schema)…
    expect(result.baselineApplied.length).toBeGreaterThan(0);
    // …and the client migrations still applied on top.
    expect(result.applied.length).toBeGreaterThan(0);
    // psql-only meta commands (the pg_dump `\restrict` header) are stripped
    // before sending — they are not valid SQL over the wire protocol.
    const sentBaseline = dbState.simpleApplied.join("\n");
    expect(sentBaseline).not.toContain("\\restrict");
    expect(sentBaseline).not.toContain("\n\\");
  });

  test("does not re-apply the baseline when the schema already exists", async () => {
    dbState.schemaPresent = true;
    const result = await applyClientMigrationsOnBoot({
      env: { RUN_CLIENT_MIGRATIONS_ON_BOOT: "1", DATABASE_URL: "postgres://x" },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.baselineApplied).toEqual([]);
  });

  test("seeds E2E fixtures on an ephemeral preview when requested", async () => {
    dbState.schemaPresent = false;
    const result = await applyClientMigrationsOnBoot({
      env: {
        RUN_CLIENT_MIGRATIONS_ON_BOOT: "1",
        E2E_SEED_ON_BOOT: "true",
        RAILWAY_ENVIRONMENT_NAME: "callcaster-pr-1731",
        DATABASE_URL: "postgres://x",
      },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.seedApplied).toBe(true);
    // The seed script was spawned with bun and the seed path.
    expect(dbState.spawnCalls).toHaveLength(1);
    const [command, args] = dbState.spawnCalls[0] as [string, string[]];
    expect(command).toBe("bun");
    expect(args[0]).toBe("run");
    expect(args[1]).toContain("scripts/e2e/seed-database.mjs");
  });

  test("skips the seed once its marker exists", async () => {
    dbState.seedTableExists = true;
    const result = await applyClientMigrationsOnBoot({
      env: {
        RUN_CLIENT_MIGRATIONS_ON_BOOT: "1",
        E2E_SEED_ON_BOOT: "true",
        RAILWAY_ENVIRONMENT_NAME: "callcaster-pr-1731",
        DATABASE_URL: "postgres://x",
      },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.seedApplied).toBeNull();
    expect(result.seedSkippedReason).toBe("already-applied");
    expect(dbState.spawnCalls).toHaveLength(0);
  });

  test("never seeds dev/staging/production environments", async () => {
    for (const name of ["production", "staging", "dev"]) {
      dbState.spawnCalls = [];
      const result = await applyClientMigrationsOnBoot({
        env: {
          RUN_CLIENT_MIGRATIONS_ON_BOOT: "1",
          E2E_SEED_ON_BOOT: "true",
          RAILWAY_ENVIRONMENT_NAME: name,
          DATABASE_URL: "postgres://x",
        },
        rootDir: ROOT_DIR,
      });
      expect(result.ran).toBe(true);
      if (!result.ran) continue;
      expect(result.seedSkippedReason).toBe("managed-environment");
      expect(result.seedApplied).toBeNull();
      expect(dbState.spawnCalls).toHaveLength(0);
    }
  });

  test("does not seed unless requested", async () => {
    const result = await applyClientMigrationsOnBoot({
      env: {
        RUN_CLIENT_MIGRATIONS_ON_BOOT: "1",
        RAILWAY_ENVIRONMENT_NAME: "callcaster-pr-1731",
        DATABASE_URL: "postgres://x",
      },
      rootDir: ROOT_DIR,
    });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.seedApplied).toBeNull();
    expect(result.seedSkippedReason).toBe("not-requested");
    expect(dbState.spawnCalls).toHaveLength(0);
  });
});

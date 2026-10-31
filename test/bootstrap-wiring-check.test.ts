import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, test } from "vitest";

const root = resolve(import.meta.dirname, ".."), migration = "20261031000001_predictive_human_admission.sql";
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "bootstrap-wiring-"));
  for (const folder of ["scripts/db", "scripts/e2e", "client/migrations"]) mkdirSync(join(fixture, folder), { recursive: true });
  cpSync(join(root, "scripts/lib"), join(fixture, "scripts/lib"), { recursive: true });
  cpSync(join(root, "drizzle"), join(fixture, "drizzle"), { recursive: true });
  for (const script of ["scripts/db/bootstrap-fresh-db.mjs", "scripts/e2e/bootstrap-compose-db.mjs", "package.json"]) {
    cpSync(join(root, script), join(fixture, script));
  }
  for (const filename of readdirSync(join(root, "client/migrations"))) {
    if (filename.endsWith(".sql")) writeFileSync(join(fixture, "client/migrations", filename), "");
  }
  symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));

function check() {
  return spawnSync("npm", ["run", "db:bootstrap:check"], { cwd: fixture, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, DATABASE_URL: "postgresql://fixture@remote.invalid/unused" } });
}

test("both bootstrap lists can be checked without validating or connecting to a database target", () => {
  const result = check();
  expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("[bootstrap-fresh-db] migration wiring OK");
  expect(result.stdout).toContain("[e2e-bootstrap] migration wiring OK");
});

test("a new unwired migration fails the local bootstrap gate", () => {
  writeFileSync(join(fixture, "client/migrations/20990101000000_unwired_fixture.sql"), "");
  const result = check();
  expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
  expect(result.stderr).toContain("20990101000000_unwired_fixture.sql");
});

test("the local gate rejects a migration wired in fresh bootstrap but missing from compose", () => {
  const script = join(fixture, "scripts/e2e/bootstrap-compose-db.mjs");
  const source = readFileSync(script, "utf8"), entry = `  "client/migrations/${migration}",\n`;
  expect(source).toContain(entry); writeFileSync(script, source.replace(entry, ""));
  const result = check();
  expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
  expect(result.stdout).toContain("[bootstrap-fresh-db] migration wiring OK");
  expect(result.stderr).toContain("[e2e-bootstrap] migrations exist");
  expect(result.stderr).toContain(migration);
});

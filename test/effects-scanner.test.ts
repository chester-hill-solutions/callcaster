import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const guard = resolve("scripts/check-effects.mjs");
const annotation = `/**
 * @effect Reset the digit-entry window.
 * @effect-deps flag
 * @effect-side-effects timer; cleared on cleanup
 * @effect-why-not-loader Live keyboard state requires a client timer.
 */`;
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "callcaster-effects-fixture-"));
  for (const directory of ["app", "scripts", "docs"]) mkdirSync(join(fixture, directory));
  writeFileSync(join(fixture, "scripts/effects-baseline.json"), "{}\n");
});
afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});
function source(text: string) {
  writeFileSync(join(fixture, "app/fixture.tsx"), text);
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [guard, ...args], { cwd: fixture, encoding: "utf8" });
}
function inventory() {
  return readFileSync(join(fixture, "docs/effects-inventory.md"), "utf8");
}

describe("effects scanner CLI", () => {
  test.each([
    "useEffect(() => {}, []);",
    "useLayoutEffect(() => {}, []);",
    "// Synchronize external state.\nuseEffect(() => {}, []);",
    "React.useEffect(() => {}, []);",
    "React.useLayoutEffect(() => {}, []);",
    "React.\n  useEffect(() => {}, []);",
    "R.useLayoutEffect(() => {}, []);",
  ])("refuses an unannotated call: %s", (call) => {
    source(call);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("app/fixture.tsx: 1 un-annotated effect(s), baseline allows 0");
    expect(inventory()).toContain("**0** documented / **1** total effects (1 grandfathered");
  });

  test.each([
    "useEffect(() => {}, [flag]);",
    "React.useEffect(() => {}, [flag]);",
    "React.useLayoutEffect(() => {}, [flag]);",
    "React.\n  useEffect(() => {}, [flag]);",
    "R.useLayoutEffect(() => {}, [flag]);",
  ])("documents an annotated full call: %s", (call) => {
    source(`${annotation}\n${call}`);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 documented, 0 grandfathered");
    expect(inventory()).toContain("**1** documented / **1** total effects (0 grandfathered");
    expect(inventory()).toContain("`app/fixture.tsx` | Reset the digit-entry window. | flag | timer; cleared on cleanup");
  });

  test("ignores actual declarations of both matched hook names", () => {
    source("export function useEffect() {}\nexport function useLayoutEffect() {}\n");
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 documented, 0 grandfathered");
    expect(inventory()).toContain("**0** documented / **0** total effects");
  });

  test("ignores hook-like text in comments and strings", () => {
    source('// useEffect(() => {}, []);\n/* React.useLayoutEffect(() => {}, []); */\nconst example = "useEffect(() => {}, [])";\nconst template = `React.useEffect(() => {}, [])`;');
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 documented, 0 grandfathered");
    expect(inventory()).toContain("**0** documented / **0** total effects");
  });

  test("a declaration does not hide a real nested hook call", () => {
    source("export function useEffect() { React.useLayoutEffect(() => {}, []); }");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("app/fixture.tsx: 1 un-annotated effect(s)");
  });

  test("uses the nearest complete comment across whitespace and line comments", () => {
    source(`${annotation}\n\n// Timer follows the current digit window.\nReact.useEffect(() => {}, [flag]);`);
    expect(run().status).toBe(0);
    expect(inventory()).toContain("`app/fixture.tsx` | Reset the digit-entry window.");
  });

  test("a distant annotation cannot cover a member call", () => {
    source(`${annotation}\nconst flag = true;\nReact.useEffect(() => {}, [flag]);`);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("app/fixture.tsx: 1 un-annotated effect(s)");
  });

  test("namespace debt is counted by baseline mode and growth fails enforcement", () => {
    source("React.useEffect(() => {}, []);");
    expect(run("--update-baseline").status).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture, "scripts/effects-baseline.json"), "utf8"))).toEqual({ "app/fixture.tsx": 1 });
    expect(run().status).toBe(0);
    expect(inventory()).toContain("**0** documented / **1** total effects");
    source("React.useEffect(() => {}, []);\nReact.useLayoutEffect(() => {}, []);");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("2 un-annotated effect(s), baseline allows 1");
  });
});

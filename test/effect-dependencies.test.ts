import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const guard = resolve("scripts/check-effects.mjs");
let fixture: string;
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "cc-effect-deps-"));
  for (const dir of ["app", "scripts", "docs"]) mkdirSync(join(fixture, dir));
  writeFileSync(join(fixture, "scripts/effects-baseline.json"), "{}\n");
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function effect(documented: string, actual: string, call = "React.useEffect") {
  return `/**
 * @effect Keep the external view in sync.
 * @effect-deps ${documented}
 * @effect-side-effects External view update.
 * @effect-why-not-loader Live client view state is not loader data.
 */
${call}(() => {}, ${actual});`;
}
function source(text: string) {
  writeFileSync(join(fixture, "app/fixture.tsx"), text);
}
function run(...args: string[]) {
  const result = spawnSync(process.execPath, [guard, ...args], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}
function baseline() {
  return JSON.parse(
    readFileSync(join(fixture, "scripts/effects-deps-baseline.json"), "utf8"),
  );
}

describe("effect dependency annotation CLI (#2067)", () => {
  test.each([
    ["[shown]", "[shown, omitted]", "undocumented dependency: omitted"],
    [
      "[fetcher.state]",
      "[fetcher.state, fetcher.data]",
      "undocumented dependency: fetcher.data",
    ],
    [
      "[fetcher.state]",
      "[fetcher.data]",
      "undocumented dependency: fetcher.data",
    ],
    [
      "shown starts the timer",
      "[shown, omitted]",
      "undocumented dependency: omitted",
    ],
  ])("rejects missing identity %#", (doc, deps, message) => {
    source(effect(doc, deps));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain("npm run tools:effects:baseline");
  });

  test.each([
    ["[shown, omitted] — retry when either changes", "[omitted, shown]"],
    ["shown starts the timer; omitted stops it", "[shown, omitted]"],
    ["[entry.isIntersecting, loading]", "[entry?.isIntersecting, loading]"],
    ["[shown]", "[shown, shown]"],
    ["none — cleanup on unmount", "[]"],
    ["[] — cleanup on unmount", "[]"],
  ])("accepts supported names and notes %#", (doc, deps) => {
    source(effect(doc, deps));
    expect(run().status).toBe(0);
  });

  test.each([
    ["[shown,\n * omitted]", "[shown, omitted]"],
    ["shown starts the timer;\n * omitted stops it", "[shown, omitted]"],
    [
      "[fetcher.state,\n * fetcher.data] — wait for the result",
      "[fetcher.state, fetcher.data]",
    ],
    [
      "fetcher.state starts the request;\n * fetcher.data contains the result",
      "[fetcher.state, fetcher.data]",
    ],
    ["[shown,\n * omitted,]\n * — both changes matter", "[shown, omitted]"],
  ])("reads complete wrapped dependency tags %#", (doc, deps) => {
    source(effect(doc, deps));
    expect(run().status).toBe(0);
  });

  test("a wrapped list still rejects an omitted member", () => {
    source(
      effect(
        "[fetcher.state,\n * fetcher.other]",
        "[fetcher.state, fetcher.data]",
      ),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("undocumented dependency: fetcher.data");
  });

  test("the next tag cannot supply a missing dependency name", () => {
    source(
      effect("shown starts the timer", "[shown, omitted]").replace(
        " * @effect-side-effects External view update.",
        " * @example omitted is a sample word.\n * @effect-side-effects External view update.",
      ),
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("undocumented dependency: omitted");
  });

  test("an explicit list cannot claim an unused dependency", () => {
    source(effect("[shown, obsolete]", "[shown]"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unused documented dependency: obsolete");
  });

  test.each([
    ["[shown]", "dependencies", "unsupported dependency array"],
    ["[shown]", "[...dependencies]", "unsupported dependency array"],
    ["[shown]", "[object[key]]", "unsupported dependency array"],
    ["[shown", "[shown]", "unsupported dependency annotation"],
    ["[object[key]]", "[shown]", "unsupported dependency annotation"],
  ])("rejects unsupported declaration %#", (doc, deps, message) => {
    source(effect(doc, deps));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  test("counts repeated mismatches, rejects growth and stale decrease, then rewrites", () => {
    const call = effect("[shown]", "[shown, omitted]");
    const text = (count: number) =>
      `function Fixture() {\n${Array(count).fill(call).join("\n")}\n}`;
    source(text(2));
    expect(run("--update-baseline").status).toBe(0);
    expect(baseline()).toEqual({
      "app/fixture.tsx::Fixture::undocumented dependency: omitted": 2,
    });
    expect(run().status).toBe(0);
    source(text(3));
    expect(run().stderr).toContain("3 occurrence(s), baseline allows 2");
    expect(run().status).toBe(1);
    source(text(1));
    const stale = run();
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("stale dependency allowance 2, current 1");
    expect(run("--update-baseline").status).toBe(0);
    expect(baseline()).toEqual({
      "app/fixture.tsx::Fixture::undocumented dependency: omitted": 1,
    });
    expect(run().status).toBe(0);
  });

  test("a fully repaired or removed effect cannot keep an old dependency allowance", () => {
    source(effect("[shown]", "[shown, omitted]"));
    expect(run("--update-baseline").status).toBe(0);
    source(effect("[shown, omitted]", "[shown, omitted]"));
    expect(run().status).toBe(1);
    expect(run().stderr).toContain("stale dependency allowance 1, current 0");
    source("");
    expect(run().status).toBe(1);
    expect(run("--update-baseline").status).toBe(0);
    expect(baseline()).toEqual({});
    expect(run().status).toBe(0);
  });

  test("scope identities prevent one function's allowance covering another function", () => {
    const call = effect("[shown]", "[shown, omitted]");
    source(`function First() { ${call} }`);
    expect(run("--update-baseline").status).toBe(0);
    source(`function Second() { ${call} }`);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Second::undocumented dependency: omitted");
    expect(result.stderr).toContain(
      "First::undocumented dependency: omitted: stale",
    );
  });

  test("a missing annotation allowance is stale after the effect is documented", () => {
    source("useEffect(() => {}, []);");
    expect(run("--update-baseline").status).toBe(0);
    source(effect("[]", "[]"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("stale unannotated allowance 1, current 0");
    expect(run("--update-baseline").status).toBe(0);
    expect(run().status).toBe(0);
  });

  test("invalid counted allowances fail with the rewrite command", () => {
    source(effect("[]", "[]"));
    writeFileSync(
      join(fixture, "scripts/effects-deps-baseline.json"),
      '{"bad":0}\n',
    );
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid dependency allowance 0");
    expect(result.stderr).toContain("npm run tools:effects:baseline");
  });
});

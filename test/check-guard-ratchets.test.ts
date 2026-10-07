import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

let fixture: string;
const redirectScript = resolve("scripts/check-relative-redirects.mjs");
const mockScript = resolve("scripts/check-test-mock-coverage.mjs");
const route = "app/routes/owned.action.server.ts";
const mockFile = "test/owned.test.ts";
const mockKey = `${mockFile}::@/lib/owned.server`;
const replacingMock =
  'vi.mock("@/lib/owned.server", () => ({ ready: true }));\n';
function write(file: string, source: string) {
  writeFileSync(join(fixture, file), source);
}
function redirectBaseline(
  allowed: { file: string; line: number; target: string }[],
) {
  write(
    "scripts/baselines/relative-redirects.json",
    JSON.stringify({ allowed }),
  );
}
function run(script: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [script, `--root=${fixture}`, ...args],
    {
      cwd: fixture,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).not.toBeNull();
  return { status: result.status, output: result.stdout + result.stderr };
}
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "callcaster-guard-ratchets-"));
  for (const directory of ["app/routes", "scripts/baselines", "test"])
    mkdirSync(join(fixture, directory), { recursive: true });
  redirectBaseline([]);
  write("scripts/baselines/test-mock-replace.txt", "");
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));

describe("actual relative-redirect CLI ratchet", () => {
  test("an identical second redirect on the same line exceeds one allowed occurrence", () => {
    write(route, 'redirect("./foo"); redirect("./foo");\n');
    const entry = { file: route, line: 1, target: "./foo" };
    redirectBaseline([entry]);
    const result = run(redirectScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("new route-relative");
    redirectBaseline([entry, entry]);
    expect(run(redirectScript).status).toBe(0);
  });
  test("removing one of two identical redirects makes its unused allowance stale", () => {
    write(route, 'redirect("./foo");\n');
    const entry = { file: route, line: 1, target: "./foo" };
    redirectBaseline([entry, entry]);
    const result = run(redirectScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("stale baseline");
    expect(run(redirectScript, "--update").status).toBe(0);
    expect(run(redirectScript).status).toBe(0);
  });
  test.each(['"./foo"', "'../foo'", "`./foo`", "`../${id}`"])(
    "rejects a multiline relative redirect with %s",
    (target) => {
      write(route, `export const action = () => redirect(\n ${target}\n);\n`);
      const result = run(redirectScript);
      expect(result.status).toBe(1);
      expect(result.output).toContain(`${route}:1`);
    },
  );
  test("keeps absolute redirects outside this guard", () => {
    write(route, 'return redirect(\n "/foo"\n);\n');
    expect(run(redirectScript).status).toBe(0);
  });
  test("ignores comments and redirect-shaped string content", () => {
    write(
      route,
      'const text = \'redirect("./foo")\';\n// redirect("../bar")\n/* redirect("./baz") */\n',
    );
    expect(run(redirectScript).status).toBe(0);
  });
  test("accepts a matching baseline and detects every call on one line", () => {
    write(route, 'redirect("./foo"); redirect("../bar");\n');
    redirectBaseline([{ file: route, line: 1, target: "./foo" }]);
    const result = run(redirectScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("../bar");
    redirectBaseline([
      { file: route, line: 1, target: "./foo" },
      { file: route, line: 1, target: "../bar" },
    ]);
    expect(run(redirectScript).status).toBe(0);
  });
  test("rejects a stale baseline with its rewrite hint, then passes after rewrite", () => {
    redirectBaseline([{ file: route, line: 1, target: "./foo" }]);
    const result = run(redirectScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("stale baseline");
    expect(result.output).toContain(
      "npm run tools:relative-redirects:baseline",
    );
    expect(run(redirectScript, "--update").status).toBe(0);
    expect(
      JSON.parse(
        readFileSync(
          join(fixture, "scripts/baselines/relative-redirects.json"),
          "utf8",
        ),
      ),
    ).toEqual({ allowed: [] });
    expect(run(redirectScript).status).toBe(0);
  });
});

describe("actual shared-server mock CLI ratchet", () => {
  test("fixture rewrites leave the repository baseline bytes unchanged", () => {
    const repositoryBaseline = resolve(
      "scripts/baselines/test-mock-replace.txt",
    );
    const before = readFileSync(repositoryBaseline);
    write(mockFile, replacingMock.repeat(2));
    expect(run(mockScript, "--baseline").status).toBe(0);
    expect(readFileSync(repositoryBaseline)).toEqual(before);
  });
  test("rejects a new replacing mock and accepts an additive mock", () => {
    write(mockFile, replacingMock);
    expect(run(mockScript).status).toBe(1);
    write(
      mockFile,
      'vi.mock("@/lib/owned.server", async (importOriginal) => ({ ...(await importOriginal()), ready: true }));\n',
    );
    expect(run(mockScript).status).toBe(0);
  });
  test("legacy keys allow one occurrence and reject a second", () => {
    write("scripts/baselines/test-mock-replace.txt", `${mockKey}\n`);
    write(mockFile, replacingMock);
    expect(run(mockScript).status).toBe(0);
    write(mockFile, replacingMock.repeat(2));
    const result = run(mockScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${mockKey}: 1 -> 2`);
  });
  test("explicit counts reject growth beyond the recorded number", () => {
    write("scripts/baselines/test-mock-replace.txt", `${mockKey}#2\n`);
    write(mockFile, replacingMock.repeat(2));
    expect(run(mockScript).status).toBe(0);
    write(mockFile, replacingMock.repeat(3));
    const result = run(mockScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain(`${mockKey}: 2 -> 3`);
  });
  test("a removed occurrence fails stale, then a rewrite retains only the remaining count", () => {
    write("scripts/baselines/test-mock-replace.txt", `${mockKey}#2\n`);
    write(mockFile, replacingMock);
    const result = run(mockScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("stale baseline");
    expect(result.output).toContain("npm run tools:test-mocks:baseline");
    expect(run(mockScript, "--baseline").status).toBe(0);
    expect(
      readFileSync(
        join(fixture, "scripts/baselines/test-mock-replace.txt"),
        "utf8",
      ),
    ).toBe(`${mockKey}#1\n`);
    expect(run(mockScript).status).toBe(0);
  });
  test("a fully repaired mock fails its stale key and drops it on rewrite", () => {
    write("scripts/baselines/test-mock-replace.txt", `${mockKey}\n`);
    const result = run(mockScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("stale baseline");
    expect(run(mockScript, "--baseline").status).toBe(0);
    expect(
      readFileSync(
        join(fixture, "scripts/baselines/test-mock-replace.txt"),
        "utf8",
      ).trim(),
    ).toBe("");
    expect(run(mockScript).status).toBe(0);
  });
  test("ignores mock-shaped strings and comments", () => {
    write(
      mockFile,
      `const sample = ${JSON.stringify(replacingMock)};\n// ${replacingMock}`,
    );
    expect(run(mockScript).status).toBe(0);
  });
  test("client modules stay outside the shared-server guard", () => {
    write(
      mockFile,
      'vi.mock("@/lib/owned.client", () => ({ ready: true }));\n',
    );
    expect(run(mockScript).status).toBe(0);
  });
  test("duplicate baseline keys cannot silently replace a count", () => {
    write(mockFile, replacingMock);
    write(
      "scripts/baselines/test-mock-replace.txt",
      `${mockKey}#1\n${mockKey}#2\n`,
    );
    const result = run(mockScript);
    expect(result.status).toBe(1);
    expect(result.output).toContain("Invalid or duplicate mock baseline entry");
  });
  test("baseline generation records actual occurrence counts", () => {
    write(mockFile, replacingMock.repeat(2));
    expect(run(mockScript, "--baseline").status).toBe(0);
    expect(
      readFileSync(
        join(fixture, "scripts/baselines/test-mock-replace.txt"),
        "utf8",
      ),
    ).toBe(`${mockKey}#2\n`);
    expect(run(mockScript).status).toBe(0);
  });
});

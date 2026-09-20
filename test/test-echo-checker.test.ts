import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Falsification for check-test-echo.mjs (#1931): the check must flag an
// expectation whose value is a SUT export, and pass a clean fixture. These
// fail if the "expected identifier imported from app/shared" heuristic is
// removed or inverted.

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts", "check-test-echo.mjs");

function runCheck(dir: string): { status: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, "--root", dir], { encoding: "utf8" });
    return { status: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function withDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "test-echo-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("check-test-echo", () => {
  test("flags an expectation that reuses a SUT export", () => {
    withDir((dir) => {
      writeFileSync(
        join(dir, "echo.test.ts"),
        [
          'import { describe, expect, test } from "vitest";',
          'import { MMS_CREDITS } from "../app/lib/pricing";',
          'test("x", () => { expect(fn()).toBe(MMS_CREDITS); });',
          "",
        ].join("\n"),
      );
      const { status, out } = runCheck(dir);
      expect(status).not.toBe(0);
      expect(out).toContain("echo.test.ts:3");
    });
  });

  test("passes when expectations are literals (wiring assertions are out of scope)", () => {
    withDir((dir) => {
      writeFileSync(
        join(dir, "clean.test.ts"),
        [
          'import { describe, expect, test } from "vitest";',
          'import { MMS_CREDITS } from "../app/lib/pricing";',
          'test("x", () => {',
          "  expect(fn()).toBe(4);",
          "  expect(fn2()).toHaveBeenCalledWith(MMS_CREDITS);",
          "});",
          "",
        ].join("\n"),
      );
      const { status } = runCheck(dir);
      expect(status).toBe(0);
    });
  });
});
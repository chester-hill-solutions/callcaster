import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { timeE2ePhase } from "../scripts/e2e/timing.mjs";

const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function summaryFile() {
  const directory = mkdtempSync(join(tmpdir(), "e2e-timing-"));
  directories.push(directory);
  const file = join(directory, "summary.md");
  vi.stubEnv("GITHUB_STEP_SUMMARY", file);
  return file;
}

test("records elapsed time after the asynchronous phase completes", async () => {
  const file = summaryFile();
  await timeE2ePhase("Database tests", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const summary = readFileSync(file, "utf8");
  expect(summary).toMatch(/Database tests\*\*: [\d.]+s \(passed\)/);
  expect(Number(summary.match(/: ([\d.]+)s/)?.[1])).toBeGreaterThanOrEqual(
    0.015,
  );
});

test("keeps failed phases visible and preserves their failure", async () => {
  const file = summaryFile();
  const failure = new Error("database unavailable");
  await expect(
    timeE2ePhase("Bootstrap", () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  await timeE2ePhase("Cleanup", () => undefined);
  expect(readFileSync(file, "utf8")).toMatch(
    /Bootstrap\*\*: [\d.]+s \(failed\)\n- \*\*Cleanup\*\*: [\d.]+s \(passed\)/,
  );
});

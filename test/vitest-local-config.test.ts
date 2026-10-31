import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import config from "../vitest.config";
import node from "../vitest.node.config";
import ui from "../vitest.ui.config";

describe("full local Vitest configuration", () => {
  test.each([
    { cpus: 8, memoryGiB: 16, workers: 4 },
    { cpus: 4, memoryGiB: 8, workers: 2 },
    { cpus: 1, memoryGiB: 2, workers: 1 },
    { cpus: 16, memoryGiB: 4, workers: 2 },
    { cpus: 64, memoryGiB: 128, workers: 4 },
  ])(
    "bounds the pool to $workers workers for $cpus cores and $memoryGiB GiB",
    async ({ cpus, memoryGiB, workers }) => {
      vi.resetModules();
      vi.doMock("node:os", async (importOriginal) => ({
        ...(await importOriginal<typeof import("node:os")>()),
        availableParallelism: () => cpus,
        totalmem: () => memoryGiB * 1024 ** 3,
      }));
      try {
        const { default: isolated } = await import("../vitest.config");
        expect(isolated.test?.maxWorkers).toBe(workers);
      } finally {
        vi.doUnmock("node:os");
        vi.resetModules();
      }
    },
  );

  test("retains each suite's selection, setup and aliases with one bounded isolated process pool", () => {
    const workers = config.test?.maxWorkers;
    expect(workers).toBeGreaterThanOrEqual(1);
    expect(workers).toBeLessThanOrEqual(4);
    const projects = config.test?.projects;
    expect(projects).toHaveLength(2);
    for (const [index, original] of [node, ui].entries()) {
      expect(projects?.[index]).toEqual({
        ...original,
        test: {
          ...original.test,
          maxWorkers: workers,
          pool: "forks",
          isolate: true,
        },
      });
    }
  });

  test("discovers the exact Node and UI file union without omissions or duplicates", () => {
    const dir = mkdtempSync(join(tmpdir(), "local-vitest-manifest-"));
    try {
      function list(name: string) {
        const report = join(dir, `${name}.json`);
        const result = spawnSync(
          process.execPath,
          [
            "node_modules/vitest/vitest.mjs",
            "list",
            "-c",
            name,
            "--filesOnly",
            `--json=${report}`,
          ],
          { encoding: "utf8", timeout: 20_000 },
        );
        if (result.status !== 0) throw new Error(result.stdout + result.stderr);
        const files: { file: string; projectName: string }[] = JSON.parse(
          readFileSync(report, "utf8"),
        );
        return files
          .map(({ file, projectName }) => `${projectName}:${file}`)
          .sort();
      }
      const expected = [
        ...list("vitest.node.config.ts"),
        ...list("vitest.ui.config.ts"),
      ].sort();
      const actual = list("vitest.config.ts");
      expect(actual.length).toBeGreaterThan(0);
      expect(new Set(actual).size).toBe(actual.length);
      expect(actual).toEqual(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

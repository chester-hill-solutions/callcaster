import { readFileSync } from "node:fs";

import { load } from "js-yaml";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const workflowSchema = z.object({
  jobs: z.record(z.string(), z.object({
    name: z.string(),
    environment: z.string(),
    env: z.object({ DATABASE_URL: z.string() }),
    steps: z.array(z.object({
      uses: z.string().optional(),
      with: z.record(z.string(), z.unknown()).optional(),
      run: z.string().optional(),
    })),
  })),
});

function readWorkflow() {
  return workflowSchema.parse(load(readFileSync(
    new URL("../.github/workflows/ledger-drift-check.yml", import.meta.url),
    "utf8",
  )));
}

describe("environment drift comparison (#2064)", () => {
  test.each([
    { environment: "dev", branch: "dev", name: "Dev drift against dev" },
    { environment: "staging", branch: "master", name: "Staging drift against master" },
    { environment: "production", branch: "master", name: "Production drift against master" },
  ])("$environment uses its deployed branch and preserves database gates", ({ environment, branch, name }) => {
    const job = readWorkflow().jobs[environment];
    expect(job).toBeDefined();
    expect(job.name).toBe(name);
    expect(job.environment).toBe(environment);
    expect(job.env.DATABASE_URL).toBe("${{ secrets.DATABASE_URL }}");

    const checkouts = job.steps.filter(step => step.uses?.startsWith("actions/checkout@"));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0].with?.ref).toBe(branch);

    const commands = job.steps.flatMap(step => step.run ? [step.run] : []);
    expect(commands).toEqual([
      "npm ci",
      "node scripts/db/check-migration-ledger.mjs --require-db",
      "node scripts/db/check-schema-drift.mjs --require-db",
    ]);
  });
});

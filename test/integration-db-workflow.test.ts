import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { expect, test } from "vitest";
import { z } from "zod";

const event = z.record(z.string(), z.unknown()).nullable();
const workflowSchema = z.object({
  on: z.object({ pull_request: event, push: event }),
  jobs: z.object({
    guards: z.object({
      if: z.unknown().optional(),
      "continue-on-error": z.boolean().optional(),
      steps: z.array(
        z.object({
          run: z.string().optional(),
          if: z.unknown().optional(),
          "continue-on-error": z.boolean().optional(),
          env: z.record(z.string(), z.string()).optional(),
        }),
      ),
    }),
  }),
});

function workflow() {
  return workflowSchema.parse(
    load(
      readFileSync(
        new URL(
          "../.github/workflows/schema-default-drift.yml",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}

test("every PR gets a database result without file, branch or event-type filters", () => {
  const pull = workflow().on.pull_request;
  expect(pull ?? {}).toEqual({});
});

test("every dev push gets a database result without file filters", () => {
  expect(workflow().on.push).toEqual({ branches: ["dev"] });
});

test("the independent job bootstraps its own database before the full tier", () => {
  const job = workflow().jobs.guards;
  expect(job.if).toBeUndefined();
  const bootstrap = job.steps.findIndex(
    (step) => step.run === "node scripts/e2e/bootstrap-compose-db.mjs",
  );
  const tier = job.steps.findIndex(
    (step) => step.run === "npm run test:integration-db",
  );
  expect(bootstrap).toBeGreaterThanOrEqual(0);
  expect(tier).toBeGreaterThan(bootstrap);
  expect(job.steps[tier].env?.DATABASE_URL).toBe(
    job.steps[bootstrap].env?.DATABASE_URL,
  );
  expect(job.steps[tier].env?.DATABASE_URL).toMatch(
    /^postgres:\/\/callcaster:callcaster@127\.0\.0\.1:5436\/callcaster$/,
  );
  expect(job.steps[bootstrap].if).toBeUndefined();
  expect(job.steps[tier].if).toBeUndefined();
});

test("a failed bootstrap or integration assertion remains a failed job", () => {
  const job = workflow().jobs.guards;
  expect(job["continue-on-error"]).not.toBe(true);
  const commands = job.steps.filter(
    (step) =>
      step.run?.includes("bootstrap-compose-db.mjs") ||
      step.run?.includes("test:integration-db"),
  );
  expect(commands).toHaveLength(2);
  for (const step of commands) expect(step["continue-on-error"]).not.toBe(true);
  expect(commands[1].run).toBe("npm run test:integration-db");
});

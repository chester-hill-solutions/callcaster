import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
// Keep repository writes inside the fixtures even when the caller has Git overrides.
const fixtureEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
let fixtureRoot = "";
let commits: { master: string; dev: string; side: string };

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: fixtureRoot, encoding: "utf8", env: fixtureEnvironment,
  }).trim();
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "cc-verdict-git-"));
  git(["init", "--quiet"]);
  git(["config", "user.name", "Verdict Test"]);
  git(["config", "user.email", "verdict@example.test"]);
  git(["config", "commit.gpgsign", "false"]);
  mkdirSync(join(fixtureRoot, "empty-hooks"));
  git(["config", "core.hooksPath", join(fixtureRoot, "empty-hooks")]);
  git(["commit", "--allow-empty", "--quiet", "-m", "master fixture"]);
  const master = git(["rev-parse", "HEAD"]);
  git(["update-ref", "refs/remotes/origin/master", master]);
  git(["commit", "--allow-empty", "--quiet", "-m", "dev-only fixture"]);
  const dev = git(["rev-parse", "HEAD"]);
  git(["update-ref", "refs/remotes/origin/dev", dev]);
  git(["checkout", "--quiet", "--detach", master]);
  git(["commit", "--allow-empty", "--quiet", "-m", "unrelated fixture"]);
  commits = { master, dev, side: git(["rev-parse", "HEAD"]) };

  mkdirSync(join(fixtureRoot, ".opencode"));
  cpSync(join(sourceRoot, ".opencode/tools"), join(fixtureRoot, ".opencode/tools"), { recursive: true });
  for (const name of ["bin", "verdicts", "briefs"]) mkdirSync(join(fixtureRoot, name));
  writeFileSync(join(fixtureRoot, "bin/gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const query = args.find(value => value.startsWith("query="))?.slice(6).trim();
if (args[0] !== "api" || args[1] !== "graphql" || !query?.startsWith("query(")) {
  throw new Error("Unexpected GitHub request: dry runs must only read the board");
}
fs.appendFileSync(process.env.CC_VERDICT_GH_LOG, JSON.stringify(args) + "\\n");
process.stdout.write(JSON.stringify({ data: { organization: { projectV2: { items: {
  pageInfo: { hasNextPage: false, endCursor: null },
  nodes: [{ content: { number: 41, state: "CLOSED", repository: {
    nameWithOwner: "chester-hill-solutions/callcaster"
  } }, fieldValueByName: { name: "Backlog" } }]
} } } } }));
`, { mode: 0o755 });
});

afterEach(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = "";
});

type Candidate = "dev" | "master" | "side" | "missing" | "bad-type" | "missing-then-dev";
type PlanCase = {
  name: string;
  verdict: "PARTIAL" | "NOT_FIXED";
  candidate: Candidate;
  expectedStatus: "on-dev" | "In progress" | "on-qa";
  drop?: "master" | "dev";
  remaining?: "person";
};

const cases: PlanCase[] = [
  { name: "a partial fix on dev", verdict: "PARTIAL", candidate: "dev", expectedStatus: "on-dev" },
  { name: "a fix missing from master but present on dev", verdict: "NOT_FIXED", candidate: "dev", expectedStatus: "on-dev" },
  { name: "a valid dev fix after a missing candidate", verdict: "PARTIAL", candidate: "missing-then-dev", expectedStatus: "on-dev" },
  { name: "a partial fix already in master", verdict: "PARTIAL", candidate: "master", expectedStatus: "In progress" },
  { name: "a candidate outside dev", verdict: "PARTIAL", candidate: "side", expectedStatus: "In progress" },
  { name: "an invalid candidate ref", verdict: "PARTIAL", candidate: "missing", expectedStatus: "In progress" },
  { name: "a malformed candidate value", verdict: "PARTIAL", candidate: "bad-type", expectedStatus: "In progress" },
  { name: "an unavailable master ref", verdict: "PARTIAL", candidate: "dev", drop: "master", expectedStatus: "In progress" },
  { name: "an unavailable dev ref", verdict: "PARTIAL", candidate: "dev", drop: "dev", expectedStatus: "In progress" },
  { name: "a remaining operator action", verdict: "PARTIAL", candidate: "master", remaining: "person", expectedStatus: "on-qa" },
];

describe("issue verification CLI with real Git ancestry (#2760)", () => {
  test.each(cases)("plans $expectedStatus for $name", ({ verdict, candidate, drop, remaining, expectedStatus }) => {
    if (drop) git(["update-ref", "-d", `refs/remotes/origin/${drop}`]);
    const candidates: Record<Candidate, Array<string | number>> = {
      dev: [commits.dev], master: [commits.master], side: [commits.side],
      missing: ["not-a-commit"], "bad-type": [42],
      "missing-then-dev": ["not-a-commit", commits.dev],
    };
    writeFileSync(join(fixtureRoot, "verdicts/41.json"), JSON.stringify({
      issue: 41, verdict, manual: false, remaining,
    }));
    writeFileSync(join(fixtureRoot, "briefs/41.json"), JSON.stringify({
      issue: 41, candidate_pr_commits: candidates[candidate].map(sha => ({ sha })),
    }));
    const result = spawnSync(process.execPath, [
      join(fixtureRoot, ".opencode/tools/apply-issue-verdicts.mjs"),
      "--verdicts", join(fixtureRoot, "verdicts"),
      "--briefs", join(fixtureRoot, "briefs"),
    ], {
      cwd: fixtureRoot, encoding: "utf8",
      env: {
        ...fixtureEnvironment,
        PATH: [join(fixtureRoot, "bin"), dirname(process.execPath), process.env.PATH].join(":"),
        CC_VERDICT_GH_LOG: join(fixtureRoot, "gh-calls.jsonl"),
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`CLOSED->OPEN  Backlog->${expectedStatus}`);
    expect(result.stdout).toContain("mode: DRY RUN");
    // The fake CLI rejects every write and every query except the board read.
    // This checks the real planner rather than reproducing its branch logic.
    expect(readFileSync(join(fixtureRoot, "gh-calls.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });
});

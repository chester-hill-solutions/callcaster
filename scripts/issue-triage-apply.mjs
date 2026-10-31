#!/usr/bin/env node
/**
 * Publish one issue-triage result: set the organization Issue field `Priority`,
 * then post or update the triage comment.
 *
 * The agent never touches GitHub. This script owns every write, so the comment
 * body and the field mutation stay deterministic and auditable. The field is
 * written first so the comment never claims a write that failed.
 *
 * Usage:
 *   node scripts/issue-triage-apply.mjs --issue 1234 --repo owner/name \
 *     --triage .issue-triage/triage.json [--ref <sha>] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  buildPriorityMutation,
  renderComment,
  shouldSuggest,
  TRIAGE_MARKER,
  validateTriage,
  verifyCodeSections,
} from "./issue-triage-lib.mjs";

function parseArgs(argv) {
  const args = { ref: "dev", dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    index += 1;
    if (flag === "--issue") args.issue = Number(value);
    else if (flag === "--repo") args.repo = value;
    else if (flag === "--triage") args.triage = value;
    else if (flag === "--ref") args.ref = value;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isInteger(args.issue) || args.issue <= 0) throw new Error("--issue is required");
  if (!args.repo || !args.repo.includes("/")) throw new Error("--repo owner/name is required");
  if (!args.triage) throw new Error("--triage path is required");
  return args;
}

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

function graphql(query, variables) {
  const stdout = gh(["api", "graphql", "--input", "-"], JSON.stringify({ query, variables }));
  return JSON.parse(stdout).data;
}

function isRegularFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function lineCount(path) {
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  return content.endsWith("\n") ? lines.length - 1 : lines.length;
}

/**
 * Re-runs edit the previous triage comment instead of stacking duplicates.
 * The author filter matters: without it any commenter could post the marker
 * and have the next run rewrite their comment.
 */
function findTriageComment(repo, issue, login) {
  const stdout = gh([
    "api",
    `repos/${repo}/issues/${issue}/comments`,
    "--paginate",
    "--jq",
    `.[] | select(.user.login == "${login}") | select((.body // "") | contains("${TRIAGE_MARKER}")) | .id`,
  ]);
  return stdout.split("\n").find((line) => line.trim()) ?? null;
}

const READ_ISSUE = `query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) { id }
  }
  organization(login: $owner) {
    issueFields(first: 100) {
      nodes {
        ... on IssueFieldSingleSelect {
          id
          name
          options { id name }
        }
      }
    }
  }
}`;

const READ_PRIORITY = `query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      issueFieldValues(first: 20) {
        nodes {
          ... on IssueFieldSingleSelectValue {
            name
            field { ... on IssueFieldSingleSelect { name } }
          }
        }
      }
    }
  }
}`;

function resolvePriority({ repo, issue, priority }) {
  const [owner, name] = repo.split("/");
  const data = graphql(READ_ISSUE, { owner, name, number: issue });
  const issueId = data.repository?.issue?.id;
  if (!issueId) throw new Error(`issue #${issue} not found in ${repo}`);
  const fields = data.organization?.issueFields?.nodes ?? [];
  const field = fields.find((node) => node?.name?.toLowerCase() === "priority");
  if (!field) {
    throw new Error(
      `organization ${owner} has no single-select Issue field "Priority" in its first 100 fields`,
    );
  }
  const option = field.options.find((candidate) => candidate.name === priority);
  if (!option) {
    const available = field.options.map((candidate) => candidate.name).join(", ");
    throw new Error(`Priority field has no option "${priority}" (has: ${available})`);
  }
  return { issueId, fieldId: field.id, optionId: option.id };
}

function verifyPriority({ repo, issue }) {
  const [owner, name] = repo.split("/");
  const data = graphql(READ_PRIORITY, { owner, name, number: issue });
  const values = data.repository?.issue?.issueFieldValues?.nodes ?? [];
  return values.find((node) => node?.field?.name?.toLowerCase() === "priority")?.name ?? null;
}

function writePriority({ repo, issue, triage }) {
  const suggest = shouldSuggest(triage);
  const ids = resolvePriority({ repo, issue, priority: triage.priority });
  const payload = buildPriorityMutation({
    ...ids,
    priorityConfidence: triage.priorityConfidence,
    rationale: triage.priorityReason,
    suggest,
  });
  graphql(payload.query, payload.variables);

  if (suggest) return "suggested";
  const stored = verifyPriority({ repo, issue });
  if (stored !== triage.priority) {
    throw new Error(`stored value is ${stored ?? "unset"}, expected ${triage.priority}`);
  }
  return "set";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const parsed = validateTriage(readFileSync(args.triage, "utf8"));
  const { triage, dropped } = verifyCodeSections(parsed, {
    exists: isRegularFile,
    lineCount,
  });
  for (const section of dropped) {
    console.error(`issue-triage: dropped unknown path ${section.path}`);
  }
  if (triage.codeSections.length === 0) {
    console.error("issue-triage: no verified code section survived; the comment has no code links");
  }

  const [owner, name] = args.repo.split("/");
  const repoUrl = `https://github.com/${owner}/${name}`;

  if (args.dryRun) {
    const outcome = !triage.priority ? "unset" : shouldSuggest(triage) ? "suggested" : "set";
    process.stdout.write(renderComment(triage, { repoUrl, ref: args.ref, priorityOutcome: outcome }));
    return;
  }

  let outcome = "unset";
  let failure = null;
  if (triage.priority) {
    try {
      outcome = writePriority({ repo: args.repo, issue: args.issue, triage });
    } catch (error) {
      outcome = "failed";
      failure = error.message;
    }
  }

  const comment = renderComment(triage, { repoUrl, ref: args.ref, priorityOutcome: outcome });
  const login = gh(["api", "user", "--jq", ".login"]).trim();
  const existing = findTriageComment(args.repo, args.issue, login);
  if (existing) {
    const body = JSON.stringify({ body: comment });
    gh(["api", "--method", "PATCH", `repos/${args.repo}/issues/comments/${existing}`, "--input", "-"], body);
    console.log(`issue-triage: updated triage comment ${existing} on #${args.issue}`);
  } else {
    gh(["issue", "comment", String(args.issue), "--repo", args.repo, "--body-file", "-"], comment);
    console.log(`issue-triage: commented on #${args.issue}`);
  }

  console.log(`issue-triage: priority ${outcome}`);
  if (failure) {
    console.error(`issue-triage: priority write failed: ${failure}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`issue-triage: ${error.message}`);
    process.exitCode = 1;
  }
}

import { execFileSync } from "node:child_process";
import { closingIssueNumbers } from "./issue-closing-references.mjs";

const repo = process.env.REPO;
const pr = process.env.PR_NUMBER;
const owner = process.env.PROJECT_OWNER;
const project = process.env.PROJECT_NUMBER;
const status = process.env.STATUS_VALUE ?? "on-dev";
if (!repo || !pr || !owner || !project) throw new Error("Repository, PR, and project configuration are required.");
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const json = (...args) => JSON.parse(gh(...args));
const pull = json("pr", "view", pr, "--repo", repo, "--json", "body,baseRefName,mergedAt");
if (pull.baseRefName !== "dev" || !pull.mergedAt) throw new Error("Only merged dev pull requests can update the board.");
const messages = gh("api", `repos/${repo}/pulls/${pr}/commits`, "--paginate", "--jq", ".[].commit.message");
const numbers = closingIssueNumbers(`${pull.body}\n${messages}`, repo);
if (numbers.length) {
  const projectId = json("project", "view", project, "--owner", owner, "--format", "json").id;
  const fields = json("project", "field-list", project, "--owner", owner, "--format", "json").fields;
  const field = fields.find((entry) => entry.name === "Status");
  const option = field?.options?.find((entry) => entry.name === status);
  if (!option) throw new Error(`Project ${project} must have a Status option named ${status}.`);
  for (const number of numbers) {
    const issue = json("issue", "view", String(number), "--repo", repo, "--json", "state,url");
    if (issue.state !== "OPEN") continue;
    // Adding an existing item returns that item; no full-board scan or item limit.
    const item = json("project", "item-add", project, "--owner", owner, "--url", issue.url, "--format", "json");
    gh("project", "item-edit", "--project-id", projectId, "--id", item.id, "--field-id", field.id, "--single-select-option-id", option.id);
    console.log(`#${number}: project status set to ${status}`);
  }
} else {
  console.log("No local closing references; no board changes.");
}

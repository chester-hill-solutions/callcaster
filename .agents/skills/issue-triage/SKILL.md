---
name: issue-triage
description: "Use when a new GitHub issue needs its gaps filled, the code it touches located, or its Priority set on the CHS board, or when the issue-triage workflow must be debugged or backfilled."
---

# Issue triage agent

New issues are triaged automatically by
[`.github/workflows/issue-triage.yml`](../../../.github/workflows/issue-triage.yml),
which runs the OpenCode agent
[`.opencode/agents/issue-triage.md`](../../../.opencode/agents/issue-triage.md).

The agent writes one file and nothing else. The script
[`scripts/issue-triage-apply.mjs`](../../../scripts/issue-triage-apply.mjs) owns
every GitHub write, so the comment text is deterministic and each code link is
checked against the checkout before it is published.

Extends `github-issues` and `github-projects` — apply their auth rules first.

## What it produces

1. One comment: summary, priority and reason, missing information, questions for
   the reporter, relevant files with pinned line links, and one next step.
2. The organization Issue field `Priority` (`Urgent`, `High`, `Medium`, `Low`).
   This is an **Issue field**, not a Project field — `.github/projects.yaml`
   only records `Status`. GitHub stores the agent's confidence and rationale on
   the value.

A `low` confidence choice is written with `suggest: true`, which stores a
pending suggestion for a human instead of applying it. A `null` priority leaves
the field untouched.

A re-run edits the existing triage comment (found by its HTML marker) instead
of posting a second one.

## Configuration

| Name | Kind | Required | Purpose |
| --- | --- | --- | --- |
| `OPENCODE_API_KEY` | secret | yes | Model access. Without it the job warns and skips. |
| `TRIAGE_TOKEN` | secret | no | Override token with `issues: write` and org Issue field write. Defaults to `github.token`. |
| `ISSUE_TRIAGE_MODEL` | variable | no | `provider/model` for the run. Default `opencode/claude-haiku-5-5`. |
| `ISSUE_TRIAGE_OPENCODE_VERSION` | variable | no | Pins the CLI version installed by the installer script. |

## Run it locally

```bash
mkdir -p .issue-triage
gh issue view <n> --repo chester-hill-solutions/callcaster \
  --json number,title,body,author,labels,url,createdAt,comments \
  > .issue-triage/issue.json

opencode run --standalone --auto --agent issue-triage \
  "Triage issue #<n> from .issue-triage/issue.json. Follow your instructions exactly and write .issue-triage/triage.json."

node scripts/issue-triage-apply.mjs --issue <n> \
  --repo chester-hill-solutions/callcaster \
  --triage .issue-triage/triage.json --dry-run
```

`--dry-run` prints the comment and stops before any write. Drop it to publish.

`.issue-triage/` is gitignored. Never commit it.

## Backfill or re-run

Use **Actions → Issue triage → Run workflow** and give the issue number. The
manual run ignores the bot and `skip-triage` filters.

## When the workflow fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| Job skipped with a warning | `OPENCODE_API_KEY` not set | Add the secret. |
| `triage.json is not valid JSON` | The agent stopped before writing, or wrote prose | Re-run; if it repeats, tighten the prompt in `.opencode/agents/issue-triage.md`. |
| `unknown key` | The agent added a field | Remove the key from the prompt or extend `TOP_LEVEL_KEYS` in `scripts/issue-triage-lib.mjs`. |
| `dropped unknown path` | The agent cited a path that does not exist | Expected safety net. The comment ships without that link. |
| `Priority field has no option` | The organization renamed an option | Update the rubric in the agent prompt and `PRIORITIES` in `scripts/issue-triage-lib.mjs`. IDs resolve live; names are validated locally. |
| `the agent config targets OpenCode V2` | PATH resolved to a V1 CLI | The install step prepends `$HOME/.opencode/bin` and fails when the version is not 2.x. |
| `no single-select Issue field "Priority"` | Field renamed or removed | Re-check with `gh api graphql` on `organization.issueFields`. |

## Changing the rubric

Edit the priority table in `.opencode/agents/issue-triage.md`. Do not encode
the rubric in the script — the script must stay independent of the judgement.

## Tests

```bash
npx vitest run -c vitest.node.config.ts test/issue-triage-lib.test.ts
```

The tests cover schema validation, the hallucinated-path filter, the
suggestion threshold, comment rendering, and the mutation payload.

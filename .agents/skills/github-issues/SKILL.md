---
name: github-issues
description: "Use when creating or editing GitHub issues, especially issue types, parent or child issues, and blocking or blocked-by dependencies."
---

# GitHub Issues

This skill extends `github-cli`; apply its authentication, repository-targeting, mutation, and general verification rules first. This skill owns only issue classification and relationships for `chester-hill-solutions/callcaster`.

## Issue Types

Use a GitHub issue type for primary work classification. Do not use a label such as `bug` as a substitute for the `Bug` type. Labels remain appropriate for orthogonal metadata, such as component, priority, status, or team ownership.

The following enabled organization types were verified for `chester-hill-solutions/callcaster` on **2026-08-08** using `gh 2.85.0` (closed-reason commands re-verified **2026-08-27** on `gh 2.96.0`):

| Type | Use for |
| --- | --- |
| `Task` | A specific piece of work |
| `Bug` | An unexpected problem or behavior |
| `Feature` | A request, idea, or new functionality |
| `User Story` | A user goal |
| `Epic` | A large body of related work |
| `Change Request` | A requested change |
| `User Log` | A record of actions or experience details |

This inventory expires after **2026-09-07** (30 days). Recheck it before choosing a type when the date has passed, the target organization changes, or `gh` rejects a type:

```bash
gh api graphql -f query='query { organization(login: "chester-hill-solutions") { issueTypes(first: 100) { nodes { id name isEnabled description } } } }'
```

Use only names returned with `isEnabled: true`; record the new verification date and CLI version in this skill when the inventory changes.

## Closed Reasons

`CLOSED` is not one state. Every closed issue carries a reason, and treating them identically produces wrong board verdicts (e.g. counting a wontfix as done):

| Reason | Meaning |
| --- | --- |
| `COMPLETED` | Done — the work landed |
| `NOT_PLANNED` | Won't do (stale, wontfix, or works-as-designed) |
| `DUPLICATE` | Same root cause as another issue; folded into the canonical one |

`REOPENED` appears as a state transition on previously closed issues — a reopen means a prior closure was contested; re-verify before trusting either verdict.

Read one issue (verified `gh 2.96.0`, **2026-08-27**):

```bash
gh issue view 1155 --repo chester-hill-solutions/callcaster --json state,stateReason
# → {"state":"CLOSED","stateReason":"COMPLETED"}
```

List closed issues by reason — `gh issue list` has **no** `--reason` flag on this CLI version, so filter the REST payload:

```bash
# everything closed as not-planned or duplicate
gh api "repos/chester-hill-solutions/callcaster/issues?state=closed&per_page=100" \
  --jq '.[] | select(.state_reason == "not_planned" or .state_reason == "duplicate") | "#\(.number) \(.state_reason) \(.title)"'
```

For a duplicate, the canonical issue is the cross-reference on the timeline:

```bash
gh api "repos/chester-hill-solutions/callcaster/issues/1155/timeline" \
  --jq '.[] | select(.event == "cross-referenced") | .source.issue.number'
```

When closing an issue you intend as wontfix, pass `--reason "not planned"` explicitly — the default closure reason is `COMPLETED`, and the board treats those oppositely.

## Atomic Task And Epic Creation

One issue is one concern: a single defect, decision, or deliverable with its own acceptance criteria. Before creating, split anything that needs the word "and" in its title. Decompose large bodies of work instead of writing mega-issues:

1. Create the `Epic` for the outcome — never implement an Epic directly.
2. Create one `Task` per unit of shippable work, each with `--parent <epic>` and its own acceptance criteria.
3. Sequence with `--blocked-by` only where a real prerequisite exists (unverified work, external dependency). Do not block tasks on each other for ordering aesthetics.
4. Verify the graph after creation (below) and link the epic from the board or tracker recommendation.

```bash
gh issue create --repo chester-hill-solutions/callcaster \
  --title "Epic: migrate billing to usage-based ledger" --type Epic --body "Outcome + scope"

gh issue create --repo chester-hill-solutions/callcaster \
  --title "Task: backfill ledger rows for open workspaces" --type Task \
  --parent <epic-number> --blocked-by <prereq-number> \
  --body "One concern, acceptance criteria, verify step"
```

## Create

Use native create flags to assign type and relationships at creation time:

```bash
gh issue create \
  --repo chester-hill-solutions/callcaster \
  --title "Concise, actionable title" \
  --body "Markdown body" \
  --type Bug \
  --parent 100 \
  --blocked-by 200 \
  --blocking 300
```

Omit relationship flags that do not apply. `--parent` makes the new issue a child of the given issue. `--blocked-by` means the new issue cannot proceed until the listed issue is resolved; `--blocking` means the new issue prevents the listed issue from proceeding.

## Edit Relationships And Type

Fetch the issue first, then use the exact relationship direction:

```bash
gh issue view 123 \
  --repo chester-hill-solutions/callcaster \
  --json number,title,state,stateReason,issueType,parent,subIssues,blockedBy,blocking,labels,url

gh issue edit 123 --repo chester-hill-solutions/callcaster --type Feature
gh issue edit 123 --repo chester-hill-solutions/callcaster --parent 100
gh issue edit 100 --repo chester-hill-solutions/callcaster --add-sub-issue 123
gh issue edit 123 --repo chester-hill-solutions/callcaster --add-blocked-by 200
gh issue edit 123 --repo chester-hill-solutions/callcaster --add-blocking 300
```

Use `--remove-type`, `--remove-parent`, `--remove-sub-issue`, `--remove-blocked-by`, or `--remove-blocking` only after verifying the existing relationship and desired direction. A parent/child relation expresses decomposition; a blocking relation expresses sequencing. Do not substitute one for the other.

## Issue-Specific Verification

After create or edit, fetch the issue with the JSON fields above and confirm the type, parent or children, dependencies, and labels. Report any unavailable type or relationship rather than silently falling back to a label or changing the intended hierarchy.

## Pull Requests And Issue Comments

- One issue, one concern, one pull request. Keep a PR's scope as small as it can be while still shipping a complete unit; a fix that touches a shared file does not get bundled with the neighbouring cleanup. Split before opening, not after review.
- Close issues from the PR, never by hand: put `Closes #<n>` in the PR body (commit messages may carry it too). The issue closes when the PR reaches the default branch; a PR into `dev` does not close anything until the dev → master release lands, and that is expected.
- Do not comment on an issue to say a PR is fixing or closing it, and do not narrate what went wrong on the issue after the fact. That explanation belongs in the PR description, which the closing link already ties to the issue.
- Issue comments are for the issue itself: questions, findings, plans, trade-offs, and decisions that change the scope. If a comment would only restate the PR, leave it out.

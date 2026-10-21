---
name: github-issues
description: "Use when creating or editing GitHub issues, especially issue types, parent or child issues, and blocking or blocked-by dependencies."
---

# GitHub Issues

This skill extends `github-cli`; apply its authentication, repository-targeting, mutation, and general verification rules first. This skill owns only issue classification and relationships for `chester-hill-solutions/callcaster`.

## User-limited issue queues

For a user-limited issue queue, read live native assignees before selecting,
editing or publishing work. Use the assignee field, not the author or cached
board. Skip issues owned by someone the user excluded, including co-assigned
issues; do not reassign an issue to make it eligible.

## Issue Types And Branch Naming

Use a GitHub issue type for primary work classification. Do not use a label such as `bug` as a substitute for the `Bug` type. Labels remain appropriate for orthogonal metadata, such as component, priority, status, or team ownership.

The native Type is also the branch naming convention. Use `Bug` → `bug/`,
`Feature` → `feature/`, `Task` → `task/`, `Epic` → `epic/`, and `User Story` →
`user-story/`. Use the real issue number and lowercase kebab-case description.
Use `chore/<description>` only for issue-free repository maintenance. Do not
use labels as Type substitutes. Stop when the Type is missing or unsupported.

`Priority`, `Effort`, and `Enviornment` are organization-level GitHub Issue
fields, not labels or GitHub Project fields. `Type` is a native GitHub Issue
Type. `gh issue view --json` does not expose organization Issue fields. Resolve
current field and option IDs with GraphQL before filtering, reporting, or
editing them.

The supported CallCaster issue types are:

| Type | Use for |
| --- | --- |
| `Bug` | An unexpected problem or behavior |
| `Feature` | A request, idea, or new functionality |
| `Task` | A specific piece of work |
| `Epic` | A large body of related work |
| `User Story` | A user goal |
| `Change Request` | A requested change to existing behavior or operations |
| `User Log` | A record of actions or details about an experience |

Recheck the live inventory before choosing a type when the target organization
changes or `gh` rejects a type:

```bash
gh api graphql -f query='query { organization(login: "chester-hill-solutions") { issueTypes(first: 100) { nodes { id name isEnabled description } } } }'
```

Use only names returned with `isEnabled: true`; record the new verification date and CLI version in this skill when the inventory changes.

Set the native Type with the CLI after reading the issue first:

```bash
gh issue edit <number> --repo chester-hill-solutions/callcaster --type Task
```

Do not use `Priority` or `Effort` as a Type. They are separate organization
Issue fields. Use the `issueFieldValues` query and
`updateIssueFieldValue` mutation in `github-cli` to edit them. Use
`github-projects` for the separate Project fields.

## Older CLI fallback

The installed CLI can lack `--type` and relationship flags shown below. Check
its help first. If those flags are absent, use REST with a JSON input file:
create via `POST repos/OWNER/REPO/issues` with the enabled type name in `type`;
link an existing child via `POST repos/OWNER/REPO/issues/PARENT/sub_issues` with
`sub_issue_id` set to the child's numeric issue ID. Verify the returned type and
`GET repos/OWNER/REPO/issues/CHILD/parent`. Do not replace issue types with labels
or create duplicate issues to repair a missing relationship.

## Required Deep Issue Inspection

Inspect each duplicate-search hit before deciding whether the concern already
has an issue. Search terms can match unrelated body text; a nonzero result
count alone does not establish a duplicate.

Every issue investigation must include the issue's relationships, organization
fields, and Project context. Do not report only the title, body, labels, and
state.

1. Confirm the repository and authentication, then read the issue with:
   `gh issue view <number> --repo chester-hill-solutions/callcaster --json number,title,body,state,stateReason,issueType,author,assignees,labels,milestone,parent,subIssues,blockedBy,blocking,closedByPullRequestsReferences,projectItems,url`.
2. Read the full issue comments and timeline. Include cross-referenced and
   linked PRs, reopen/close events, and commits.
3. Query organization issue fields and their current options:

```bash
gh api graphql -f query='query { organization(login: "chester-hill-solutions") { issueFields(first: 100) { nodes { ... on IssueFieldSingleSelect { id name options { id name } } ... on IssueFieldText { id name } ... on IssueFieldNumber { id name } } } } }'
```

4. Query the target issue's organization field values with the current field
   IDs. Record the field name and option name, not only opaque IDs. This
   includes `Priority`, `Effort`, and `Enviornment`.
5. Read `.github/projects.yaml` before Project inspection. Refresh it if it is
   missing or stale, as described by `github-projects`.
6. Resolve live Project fields with `gh project field-list 9 --owner
   chester-hill-solutions --format json`, then locate the issue with
   `gh project item-list 9 --owner chester-hill-solutions --format json`.
   Record the matching Project item ID, Status, and relevant custom fields.
7. Never infer Project Status, Project Priority, or Project Effort from labels,
   organization Issue fields, issue state, PR state, or comments.

The investigation output must state the native Type, organization Issue field
values (`Priority`, `Effort`, and `Enviornment` when set), Project Status and
relevant Project fields, relationships, linked PRs, and any mismatch between
source state and board state. Load `github-projects` for this work.

## Closed Reasons

`CLOSED` is not one state. Every closed issue carries a reason, and treating them identically produces wrong board verdicts (e.g. counting a wontfix as done).

The useful state model is:

- `OPEN` with no close reason: work is active, queued, blocked, or awaiting a
  decision. Project Status is separate and may be `Backlog`, `In progress`, or
  another board value.
- `CLOSED` with `COMPLETED`: the work landed.
- `CLOSED` with `NOT_PLANNED`: the work will not be done, is stale, is a
  wontfix, or works as designed.
- `CLOSED` with `DUPLICATE`: the issue is folded into a canonical issue.
- A `REOPENED` timeline event: a previously closed issue became open again;
  re-check the old closure reason and current evidence.

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

When closing an issue you intend as wontfix, pass `--reason "not planned"` explicitly — the default closure reason is `COMPLETED`, and the board treats those oppositely. For a duplicate, use the canonical issue directly:

```bash
gh issue close <duplicate-number> --repo chester-hill-solutions/callcaster \
  --duplicate-of <canonical-number>
```

Use `--reason duplicate` only when the canonical relationship is already known
and the CLI cannot use `--duplicate-of`. Verify `stateReason` and the duplicate
relationship after closing. To reopen an issue, use `gh issue reopen`; a reopen
is a state transition and does not erase the previous closure history.

## Issue Board Source Audits

For an audit, update the existing enrichment records and regenerate `ISSUE_BOARD.md`.
Before editing a record, read the strict schema in `scripts/issue-board-lib.mjs`
and its existing fields. Merge only supported keys; preserve acceptance criteria
and unrelated metadata. Unknown fields fail validation before board generation.
Validate enrichment JSON before publishing an edit. JSON arrays cannot have a
trailing comma after a removed entry. The pure local check needs no GitHub scope:
`node --input-type=module -e 'import { loadEnrichment } from "./scripts/issue-board-lib.mjs"; loadEnrichment("scripts/issue-board-enrichment")'`.
Preserve the enrichment files' UTF-8 characters and existing rendering. Review
the diff for unrelated serialization changes before staging.
For an atomic audit, render the selected issue with `buildBoard` and fresh native
metadata, then replace only its complete section. `buildBoard` returns
`{ md, counts }`; use `md` as the rendered text. Require the generated cause
and test fields before writing. A multiline `$` can match the heading line,
so use an explicit next-section or end-of-input boundary.
Trace the affected route or worker to its actual helper before moving an issue to
Verify and close. A merged PR that changes another parser does not fix the upload
path. For SQL, check bootstrap inclusion and later function definitions; a file
that exists but is skipped or replaced is not the active fix.

Read the applicable ADRs before putting work in Needs decision. A missing
runtime feature does not mean its policy is undecided. Keep adopted constraints
and scope the missing rollout decision. Interim warnings cannot replace a
required enforcement rule.

Separate source proof from deployed verification. Keep unfinished parts visible
when a PR resolves only part of an issue. Check proposed query predicates against
both the failing case and the control case before carrying them into the board.

## Pinned Source Links

Before publishing source evidence, discover uncertain paths with `rg --files`
and verify each pinned link with `git cat-file -e COMMIT:path`. Read the cited
lines from that exact commit. A guessed path can produce a valid-looking but
broken GitHub URL; a successful issue write does not prove the source link works.
After a correction, re-read the issue body and use the corrected snapshot for
subsequent board updates. Keep historical findings separate from current scope
so a completed task or recorded decision does not still read as unfinished.

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

## Blocking Work By Another Developer

When an issue cannot proceed until another person does something, that work is not a checklist item and does not belong in the blocked issue's body or a comment. File it as its own `Task`, link the blocking relationship in **one** direction, and assign the person who must do it. A blocker buried in prose hides the dependency, leaves the board verdict dishonest, and has no assignee to pick it up.

```bash
# The blocking task names what blocks the other issue, and who owns it.
gh issue create --repo chester-hill-solutions/callcaster \
  --title "Task: mint the PROJECT_TOKEN secret for issue-on-dev" --type Task \
  --assignee <login> --blocking <blocked-issue> \
  --body "What must happen, why it blocks #<blocked-issue>, and how to verify"

# Or create the blocker first and link the blocked issue to it:
gh issue create --repo chester-hill-solutions/callcaster \
  --title "Task: provision the QA Twilio account" --type Task --assignee <login> \
  --body "..."            # note the new issue number
gh issue edit <blocked-issue> --repo chester-hill-solutions/callcaster \
  --add-blocked-by <new-task>
```

Set the edge once: `--blocking` on the blocker or `--blocked-by` on the blocked issue, never both. Use a blocking edge only for a real prerequisite (work not yet done, an external dependency), not for ordering preference. After linking, verify with the fetch in **Issue-Specific Verification**.

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
- Close new implementation work from the PR: put `Closes #<n>` in the PR body (commit messages may carry it too). The issue closes when the PR reaches the default branch; a PR into `dev` does not close anything until the dev → master release lands, and that is expected.
- For Verify and close work whose fix is already in `origin/master`, read [issue-fix-verification](../issue-fix-verification/SKILL.md) before changing state. Record the code-backed verdict and manual-test flag, then apply its closure and Project Status rules. Release ancestry alone is not verification.
- Do not comment on an issue to say a PR is fixing or closing it, and do not narrate what went wrong on the issue after the fact. That explanation belongs in the PR description, which the closing link already ties to the issue.
- Issue comments are for the issue itself: questions, findings, plans, trade-offs, and decisions that change the scope. If a comment would only restate the PR, leave it out.

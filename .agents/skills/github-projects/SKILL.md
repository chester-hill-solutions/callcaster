---
name: github-projects
description: "Use when inspecting or changing GitHub Projects, project fields, project items, or board metadata with gh project."
---

# GitHub Projects

Source of truth: <https://cli.github.com/manual/gh_project>. Read the relevant
subcommand manual and installed `gh project <subcommand> --help` before using
a command.

## Repository Metadata

Before project work, inspect `.github/projects.yaml`.
Treat it as the repository-local record of the project name, field IDs, option
IDs, and option names. If it is missing or stale, refresh it from GitHub before
mutating the project. Do not guess opaque GitHub IDs.

For project `9` in this repository, use the list element with `id: 9` in
`.github/projects.yaml` and keep its `fields` as a subkey of that element.

## CHS Backlog Status

Project `9` (`CHS Backlog`) currently uses these `Status` values: `Backlog`, `In progress`, `on-dev`, `tested-on-dev`, `on-qa`, `on-prod`, and `archive`.

- Resolve statuses with `gh project field-list 9 --owner chester-hill-solutions --format json` before filtering or changing items.
- The installed CLI supports the verified query `gh project item-list 9 --owner chester-hill-solutions --query "status:Backlog" --limit 500 --format json`. Filter those results to the target repository before acting.
- To select work by both an organization Issue field and a Project status, query the Issue field first, query the Project status separately, then intersect the issue numbers. Do not treat a Project status as an issue label.

## Issue Fields Versus Project Fields

Keep these systems separate:

- **Native Issue Type:** GitHub issue metadata. Current CallCaster types include
  `Task`, `Bug`, `Feature`, `User Story`, `Epic`, `Change Request`, and
  `User Log`. Edit it with `gh issue edit <number> --type <Type>`.
- **Organization Issue fields:** `Priority`, `Effort`, and `Enviornment`.
  Read and edit these with the GraphQL `issueFieldValues` query and the
  `updateIssueFieldValue` mutation documented in `github-cli` and
  `github-issues`. They are not Project fields.
- **Project 9 fields:** `Status`, `Priority`, `Size`, `Estimate`, `Iteration`,
  and `Effort`. Project `Priority` and `Effort` are separate from the
  organization Issue `Priority` and `Effort`. The live Project field list is
  authoritative; `.github/projects.yaml` is a local cache and can be stale.

Read Project fields and the target item before editing:

```bash
gh project field-list 9 --owner chester-hill-solutions --format json
gh project item-list 9 --owner chester-hill-solutions --format json --limit 500
```

Set a Project single-select field by its display name:

```bash
gh project item-edit 9 \
  --owner chester-hill-solutions \
  --url https://github.com/chester-hill-solutions/callcaster/issues/<number> \
  --field "Priority" \
  --value "High"
```

The same command can set Project `Status` or Project `Effort`. For scripted
work, use the verified Project item ID, Project field ID, and option ID:

```bash
gh project item-edit \
  --id <project-item-id> \
  --project-id <project-node-id> \
  --field-id <field-id> \
  --single-select-option-id <option-id>
```

Do not use `gh project item-edit` to change organization Issue fields. After
every edit, read the issue field values or Project item again and report the
field name and option name.

## Browser export completeness

For a complete Project export, temporarily turn off Show hierarchy so child
issues appear as rows. Load the table to its end before exporting: the export
dialog includes only loaded rows, even when the filter count is larger. Require
the unique exported URLs to match the visible filtered count. A partial export
must not replace a complete snapshot. Do not save temporary view changes unless
the user requests that saved view.

When Issue metadata was not read, report it as unknown. Report an Issue field
as unset only when GitHub returned its field values and that field was empty.
Never substitute a Project field or label for a missing native Issue field.

## Pull Request and Issue Linking

Each pull request must link to the issue it resolves.

CallCaster pull requests base on `dev`. The repository default branch is `master`. GitHub reads closing keywords (`Closes #N`, `Fixes #N`, `Resolves #N`) in a pull request description only when the pull request targets the default branch. For a `dev`-based pull request, GitHub ignores these keywords: no linked pull request appears on the issue and the issue does not close on merge. Verified 2026-09-22 on pull requests #2020-#2025: each body contained `Closes #N` yet `closingIssuesReferences` stayed empty until linked explicitly.

1. Put the issue reference in the pull request body (convention: `Closes #N`). This creates a timeline cross-reference only; it is not a link.
2. Create the Development link with the official GraphQL mutation `addCloseIssueReferences`. It works for any base branch and supports existing pull requests:
   - Resolve the node IDs with `repository.issue(number: N) { id }` and `repository.pullRequest(number: N) { id }`.
   - `mutation { addCloseIssueReferences(input: { issueId: "<ISSUE_ID>", pullRequestIds: ["<PR_ID>"] }) { issue { id } } }`
3. Verify after linking: `gh pr view NUMBER --json closingIssuesReferences` returns the issue, and `GET repos/{owner}/{repo}/issues/{N}/events` contains a `connected` event.
4. Linking does not auto-close the issue. A `dev`-based pull request merges into a non-default branch, so closing-keyword semantics do not apply; close the issue in the normal verify/close flow.

## Safe Workflow

1. Confirm authentication and the target owner with `gh auth status` and `gh repo view --json nameWithOwner,url`.
2. Confirm the token has the `project` scope. Use `gh auth refresh -s project` only when required.
3. Read the project and fields before changing them. Use JSON output and stable IDs, not display names alone.
4. Use `gh project field-list NUMBER --owner OWNER --format json` to inspect field definitions. Filter locally with `--jq` when useful.
5. Treat project deletion, closing, field deletion, item deletion, archival, and item edits as mutations. Read the specific command help first.
6. After a mutation, query the project or item again and verify the changed IDs, names, and values.

## Board Refresh Without Project Read Access

The issue-board GraphQL query reads Project fields and needs `read:project`.
If that scope is absent, REST can still provide live issue state, labels and
assignees. For a source audit, pass that issue snapshot to `generateIssueBoard`
from `scripts/issue-board-generate.mjs` and validate the enrichment normally.
Do not infer Project Status from labels or PRs. Preserve cached progress markers
only with a visible notice that names their source revision and says they were
not refreshed. This fallback does not verify or change Project Status.

For a selected local board refresh, pass the normalized records returned by
`validateEnrichmentFiles` or `loadEnrichment` to `buildBoard`. Raw JSON can omit
default arrays such as `blockedBy` and fail during rendering. Build and validate
the replacement before writing the board or enrichment; preserve other entries.
Validate the full enrichment set before selecting one issue. Require all other
record values and issue sections to remain unchanged. Keep the complete snapshot
header and count; add the selected issue's source and observation time separately.
An issue-body readback does not refresh its native fields or Project Status.

## Common Commands

- View: `gh project view NUMBER --owner OWNER`
- Fields: `gh project field-list NUMBER --owner OWNER --format json`
- Items: `gh project item-list NUMBER --owner OWNER --format json`
- Create item: `gh project item-create NUMBER --owner OWNER`
- Edit item: `gh project item-edit NUMBER --owner OWNER`

Use `--help` for current flags. Do not copy this list as a substitute for the
manual.

## Selected source-board updates

For a selected enrichment refresh, preserve unrelated record text and Unicode
formatting. When removing a JSON array record, handle its adjacent comma,
including the last record. Parse the edited JSON before saving it, then run
`loadEnrichment` and `git diff --check`. Keep base snapshot dates distinct from
selected live Issue and Project checks; do not imply a complete board refresh.

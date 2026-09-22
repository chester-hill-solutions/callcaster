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

## Pull Request and Issue Linking

Each pull request must link to the issue it resolves.

CallCaster pull requests base on `dev`. The repository default branch is `master`. GitHub reads closing keywords (`Closes #N`, `Fixes #N`, `Resolves #N`) in a pull request description only when the pull request targets the default branch. For a `dev`-based pull request, GitHub ignores these keywords: no linked pull request appears on the issue, the issue does not close on merge, and `gh pr view --json closingIssuesReferences` returns empty. Verified 2026-09-22 on pull requests #2020-#2025: each body contained `Closes #N` yet `closingIssuesReferences` stayed empty.

1. Put the issue reference in the pull request body (convention: `Closes #N`). This creates a timeline cross-reference only; it is not a true link.
2. A true GitHub link requires the manual Development sidebar on the pull request or issue page. There is no official REST or GraphQL API to link an existing pull request to an issue. State clearly in the pull request or in your reply when a manual link is required.
3. Verify with the issue timeline: look for a `connected` event (manual link) or a `cross-referenced` event (body reference). `closingIssuesReferences` is authoritative only for pull requests that target the default branch.

## Safe Workflow

1. Confirm authentication and the target owner with `gh auth status` and `gh repo view --json nameWithOwner,url`.
2. Confirm the token has the `project` scope. Use `gh auth refresh -s project` only when required.
3. Read the project and fields before changing them. Use JSON output and stable IDs, not display names alone.
4. Use `gh project field-list NUMBER --owner OWNER --format json` to inspect field definitions. Filter locally with `--jq` when useful.
5. Treat project deletion, closing, field deletion, item deletion, archival, and item edits as mutations. Read the specific command help first.
6. After a mutation, query the project or item again and verify the changed IDs, names, and values.

## Common Commands

- View: `gh project view NUMBER --owner OWNER`
- Fields: `gh project field-list NUMBER --owner OWNER --format json`
- Items: `gh project item-list NUMBER --owner OWNER --format json`
- Create item: `gh project item-create NUMBER --owner OWNER`
- Edit item: `gh project item-edit NUMBER --owner OWNER`

Use `--help` for current flags. Do not copy this list as a substitute for the
manual.

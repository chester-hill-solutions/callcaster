---
name: github-pull-request
description: "Use when creating, editing, checking, merging, or otherwise managing GitHub pull requests with gh pr."
---

# GitHub Pull Requests

Source of truth: <https://cli.github.com/manual/gh_pr>. Read the relevant
subcommand manual and installed `gh <command> --help` before using a command.

## Safe Workflow

1. Confirm the repository and authentication with `gh auth status` and `gh repo view --json nameWithOwner,url`.
2. Read the current PR or branch state before changing it. Pass `--repo OWNER/REPO` when the repository is not unambiguous.
3. Keep PRs atomic. Use the repository's required base branch and include the related issue only when it is actually related.
4. Determine whether the PR has a corresponding issue. If it does not, the PR must have the `no-issue` label: add it with `gh pr create --label no-issue` or `gh pr edit --add-label no-issue`. Do not add this label to a PR that references its issue. Verify labels after creation.
5. Build long PR descriptions in a file and pass `--body-file`. Do not pass a body containing Markdown backticks, shell substitutions, `$` expressions, or unescaped apostrophes as an inline shell argument. Backticks can trigger command substitution and corrupt the description. Never let PR prose execute as shell commands.
6. After `gh pr create` or `gh pr edit`, query the PR body and metadata with `gh pr view --json number,title,body,labels,state,baseRefName,headRefName,url`. Confirm that code spans, links, labels, and the full intended description are preserved.
7. If a body is corrupted, inspect the current PR, reconstruct the intended text from the task and repository state, rewrite it through a body file, and verify the returned body before continuing. Do not treat a successful `gh` exit status as proof that the content is correct.
8. Check CI and deployment contexts for the exact tested head with REST checks/status reads. Derive expected jobs from the current diff and workflow path filters; a schema-only job from an earlier PR may not run for this change. Inspect failed checks before merging.
9. Merge only when the user requested the merge or explicitly approved it. Select the merge strategy deliberately, then verify `state`, `mergedAt`, `mergeCommit`, and the base branch.
10. If `--delete-branch` is used, verify the remote branch no longer exists. A checked-out local branch may remain.

## Late deployment contexts

A first empty commit-status read does not prove that a PR has no deployment
gates. Determine applicable deployments from the current repository and provider
configuration. Wait for the expected exact-head app and worker contexts and
verify their actual deployments. Require the current PR head, tested source,
base and clean merge state immediately before merging. A deployment from a
previous PR head cannot clear the current head.

## Structural review declaration

Read `.github/pull_request_template.md` and `review-coverage.yml` before creating
or editing a PR. High-risk paths or more than 500 added lines require a
`Structural review:` declaration in the body. Audit PRs with docs, skills or tools
outside the board/enrichment-only exemption still need that declaration.
Record the completed review and its scope; do not add a marker without review.

## Development links for dev PRs

Closing keywords in a PR into `dev` may leave `closingIssuesReferences` empty
because `dev` is not the default branch. Read that field after PR creation.
If it is empty, resolve the issue and PR node IDs, then use GraphQL
`addCloseIssueReferences(input: { issueId: ISSUE_ID, pullRequestIds: [PR_ID] })`.
The input is one issue and a list of PRs; the payload returns `issue`, not
`pullRequest`. Verify `closingIssuesReferences` afterward. Keep the issue open
until the fix reaches the default branch and its required verification is done.

## Context-only issue references

The `issue-on-dev` workflow also matches singular `issue #N` in body prose,
case-insensitively. For context-only references, use a bare `#N` or an issue URL;
do not write `issue #N`, `Issues: #N`, or a closing keyword. Before publishing,
check which numbers the workflow regex extracts and keep only the implemented
issues. A `no-issue` label does not stop this workflow from parsing the body.

## Common Commands

- Create: `gh pr create --repo OWNER/REPO --base dev --head BRANCH --title TITLE --body-file FILE`
- Create without an issue: `gh pr create --repo OWNER/REPO --base dev --head BRANCH --label no-issue --title TITLE --body-file FILE`
- View: `gh pr view NUMBER --repo OWNER/REPO --json number,title,body,labels,state,baseRefName,headRefName,url`
- Checks: `gh pr checks NUMBER --repo OWNER/REPO --watch`
- Merge: `gh pr merge NUMBER --repo OWNER/REPO --squash --delete-branch`

Use `--help` for current flags. Do not copy this list as a substitute for the
manual.

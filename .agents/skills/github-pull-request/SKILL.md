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
4. Build long PR descriptions in a file and pass `--body-file`. Do not pass a body containing Markdown backticks, shell substitutions, `$` expressions, or unescaped apostrophes as an inline shell argument. Backticks can trigger command substitution and corrupt the description. Never let PR prose execute as shell commands.
5. After `gh pr create` or `gh pr edit`, query the PR body and metadata with `gh pr view --json number,title,body,state,baseRefName,headRefName,url`. Confirm that code spans, links, and the full intended description are preserved.
6. If a body is corrupted, inspect the current PR, reconstruct the intended text from the task and repository state, rewrite it through a body file, and verify the returned body before continuing. Do not treat a successful `gh` exit status as proof that the content is correct.
7. Check required CI with `gh pr checks <number> --watch`; inspect failed checks before merging.
8. Merge only when the user requested the merge or explicitly approved it. Select the merge strategy deliberately, then verify `state`, `mergedAt`, `mergeCommit`, and the base branch.
9. If `--delete-branch` is used, verify the remote branch no longer exists. A checked-out local branch may remain.

## Common Commands

- Create: `gh pr create --repo OWNER/REPO --base dev --head BRANCH --title TITLE --body-file FILE`
- View: `gh pr view NUMBER --repo OWNER/REPO --json number,title,body,state,baseRefName,headRefName,url`
- Checks: `gh pr checks NUMBER --repo OWNER/REPO --watch`
- Merge: `gh pr merge NUMBER --repo OWNER/REPO --squash --delete-branch`

Use `--help` for current flags. Do not copy this list as a substitute for the
manual.

---
name: git
description: "Use when creating branches, rebasing, committing, pushing, or preparing changes for review in this repository."
---

# Git Workflow

Use this workflow for repository changes that need a branch, commit, or pull
request.

## Branch Rules

1. Start every work branch from `dev`. Do not branch from `master`, `main`, or an unrelated feature branch.
2. Before creating or updating a work branch, run `git fetch origin`.
3. Create the branch from the current `origin/dev`, then rebase it on `origin/dev` before committing or pushing.
4. Name branches as `type/issueNumber-some-description`.
5. Allowed types are `chore`, `bug`, `task`, `feature`, `epic`, and `test`. Use lowercase kebab-case for the description.
6. Use the actual issue number when one exists. User-authorized repository maintenance without a product issue can use `chore/<description>` and must add the `no-issue` PR label. For product work, create or update its issue before branching; do not invent an issue number.

## Required Checks

- Confirm the starting point with `git merge-base --is-ancestor origin/dev HEAD`.
- After creating the branch, run `git rebase origin/dev`.
- Review `git status`, `git diff --check`, and `git diff --stat` before committing.
- Commit only the requested changes with a concise imperative message.
- Push with `git push -u origin <branch>`.
- After pushing, verify the remote branch and open a PR into `dev`.

## Rebase with local changes

Git cannot rebase a dirty worktree. Do not discard tested changes to satisfy the
rebase step. Fetch and check whether `origin/dev` changed, commit the scoped work,
then rebase the clean branch before pushing. If the rebase changes the tested
source or its base, run full `npm run ci:local` again before the push.

Never use destructive reset or checkout commands to discard work unless the
user explicitly requests it.

## Merged worktree cleanup

For a Git-created worktree, confirm the PR merged into `dev` at its tested final
head. Verify a recovery bundle before deleting the topic refs. Require a clean
worktree, an exact head match and source equivalence with the squash merge.
Then fast-forward the clean shared `dev`, remove the topic worktree and local
branch, and delete only the verified remote topic ref. Preserve dirty worktrees,
unproven branches and user files. Use the app archive tool for app-managed
worktrees so their saved attachments remain recoverable.

After a verified merge, the provider can remove the owned PR preview before
manual cleanup starts. Read fresh project environments and compare the exact
recorded preview ID and name. If that ID is absent, verify the other recorded
environments remain and record provider cleanup; do not issue a deletion. If
the ID exists, delete only that verified owned preview, then read back its
absence and the preserved environments. An absent preview is not a reason to
delete another environment.

### Interrupted worktree removal

A short command deadline can leave an owned worktree partly deleted. Before
retrying, verify the merged PR, tested head, source-equivalent merge and recovery
bundle again. Read Git status without trimming its leading status columns.
Continue only when the worktree was clean before removal, the remaining tracked
files are unchanged and all new tracked changes are unstaged deletions from that
interrupted command. Stop for modified, staged or untracked source; preserve
ignored environment files. Restore only the proven partial deletions from the
exact verified commit, require a clean worktree, then repeat normal removal with
a sufficient command deadline. Never force-delete user changes to finish cleanup.

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
4. Use one dedicated worktree for each issue or atomic concern. Never combine two issue branches in one worktree.
5. For product work, read and verify the issue's native GitHub Type before branching. Map the Type to the branch prefix: `Bug` → `bug/`, `Feature` → `feature/`, `Task` → `task/`, `Epic` → `epic/`, and `User Story` → `user-story/`.
6. Name product branches as `<type>/<issueNumber>-some-description`. Use lowercase kebab-case for the description and name the worktree after the branch with `/` replaced by `-`.
7. Use `chore/<description>` only for issue-free repository maintenance. Such a PR must use the `no-issue` label. Do not use a label as a substitute for the native issue Type, and do not guess a missing or unsupported Type.

## Trunk and active work

Use `dev` as the trunk. Keep at most one open PR for the active working branch;
keep it in draft while work is in progress. Finish the current PR before
creating another. Do not build a parallel queue of open feature PRs.

An explicit user request for one merge batch is an exception to the normal
one-concern worktree rule. Start the batch at current `origin/dev`, reuse an
existing PR, and preserve every selected original head as an ancestor. Keep
failed and unpublished work out. Use a merge commit only when the repository
and base rules allow it; never weaken branch protection. If the trunk moves,
merge it into the batch to keep original ancestry, then retest the new head.
Run `npm run ci:local` and focused tests for affected behavior at the combined
head before the single push. Full suites and production checks run in CI.
Require exact-head remote gates, including the applicable real-DB tier, before merging,
then read back each original PR state. Keep ordinary PRs atomic.

## Required Checks

- Confirm the starting point with `git merge-base --is-ancestor origin/dev HEAD`.
- After creating the branch, run `git rebase origin/dev`.
- Review `git status`, `git diff --check`, and `git diff --stat` before committing.
- After staging, also run `git diff --cached --check`. The unstaged check
  misses new files. Normalize downloaded text line endings and trailing spaces
  without changing license text, then stage it again and repeat the check.
- Commit only the requested changes with a concise imperative message.
- Push with `git push -u origin <branch>`.
- After pushing, verify the remote branch and open a PR into `dev`.

## Scripted Git predicates

`git merge-base --is-ancestor` reports through its exit status: 0 is true,
1 is false, and other results are errors. Its empty stdout is not a boolean.
Handle each predicate separately so a normal non-ancestor result does not skip
the next check. Keep unknown refs conservative rather than treating an error as
proof that a commit is absent from a branch.

## Migration versions after a rebase

If an unmerged migration conflicts with a trunk version, inspect the deployed
ledgers first. Keep applied trunk files fixed. Give only unpublished, unapplied
migrations fresh versions, preserve their SQL bytes, and test a fresh owned
database. Keep the old local proof database and its ledger unchanged.

## Rebase with local changes

Git cannot rebase a dirty worktree. Do not discard tested changes to satisfy the
rebase step. Fetch and check whether `origin/dev` changed, commit the scoped work,
then rebase the clean branch before pushing. If the rebase changes the tested
source or its base, rerun `npm run ci:local` and affected focused tests before the push.

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

### Background PR sweep pollutes the main worktree

`/tmp/opencode/serial-sweep.sh` (and the `rebase-pr.sh` it calls) rebases a topic
branch in a linked worktree and force-pushes it. When the branch being rebased is
also checked out in the main worktree, the main worktree's index can come back
holding the *pre-rebase* content of the previous merge — staged reverts of work
that is already on `dev`.

Symptom: `git status` shows staged modifications that undo a recently merged PR,
and the worktree files no longer match `HEAD`.

Before queueing a sweep, switch the main worktree to `dev`. After it finishes,
verify with `git diff --stat` (expect no output) and `git show HEAD:<file> | grep`
for a marker of the last merge; if the tree was polluted, restore it with
`git reset -q && git checkout -- .` — nothing is lost, because `HEAD` holds the
committed state. Never commit while those staged reverts are present: it would
revert merged code.

A branch created from a **diverged** local `dev` compounds this: `git merge
--ff-only origin/dev` refuses ("Not possible to fast-forward") and the branch
starts from the wrong base. Check `git status -sb` for `[ahead …]` / `[behind …]`
and run `git reset --hard origin/dev` before branching, not after.

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
6. Use the actual issue number when one exists. If no issue number exists, stop and ask for one instead of inventing an identifier.

## Required Checks

- Confirm the starting point with `git merge-base --is-ancestor origin/dev HEAD`.
- After creating the branch, run `git rebase origin/dev`.
- Review `git status`, `git diff --check`, and `git diff --stat` before committing.
- Commit only the requested changes with a concise imperative message.
- Push with `git push -u origin <branch>`.
- After pushing, verify the remote branch and open a PR into `dev`.

Never use destructive reset or checkout commands to discard work unless the
user explicitly requests it.

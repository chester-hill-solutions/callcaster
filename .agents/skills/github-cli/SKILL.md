---
name: github-cli
description: "Use when running the gh CLI, including GitHub repositories, pull requests, issues, Actions, releases, projects, secrets, or API operations."
---

# GitHub CLI

Use the installed CLI and the official manual as the complete command and option reference. Do not maintain copied flag lists: `gh` releases add and change options.

## Source Of Truth

- Official manual: <https://cli.github.com/manual>
- Installed-version help: `gh <command> <subcommand> --help`
- Full local command reference: `gh help reference`
- Check the installed version before relying on a recent option: `gh --version`.

The manual's command surface is: `agent-task`, `alias`, `api`, `attestation`, `auth`, `browse`, `cache`, `codespace`, `completion`, `config`, `copilot`, `discussion`, `extension`, `gist`, `gpg-key`, `help`, `issue`, `label`, `licenses`, `org`, `pr`, `preview`, `project`, `release`, `repo`, `ruleset`, `run`, `search`, `secret`, `skill`, `ssh-key`, `status`, `variable`, and `workflow`. For every subcommand and option, consult the manual or installed help immediately before execution.

## Operating Rules

1. Confirm authentication and target before a remote mutation: `gh auth status`, then `gh repo view --json nameWithOwner,url`.
2. Pass `--repo OWNER/REPO` when the target is not unambiguously the current repository. Never infer an organization or repository from a title alone.
3. Prefer `--json` with `--jq` or `--template` for scripts and inspection. For REST or GraphQL capabilities missing from porcelain commands, use `gh api` and inspect the API response.
4. Read current state before modifying it. Use the specific command's `--help` to confirm the available create, edit, remove, or delete flags.
5. Treat `delete`, `close`, `merge`, `transfer`, `archive`, secret changes, permission changes, and workflow reruns/cancellations as consequential mutations. Confirm target and requested intent before running them.
6. For issue type, parent/child, or dependency work, load the `github-issues` skill in addition to this skill.

## Authentication And Scopes

Use `gh auth refresh -s <scope>` only when the operation requires an additional scope. Project mutations commonly require `project`; do not expose tokens in commands, logs, or issue bodies.

## Issue Development Branches

- Read an issue before creating its branch: `gh issue view <number> --repo chester-hill-solutions/callcaster --json number,title,body,labels,assignees,milestone,state,url`. Check `gh issue develop --help` before relying on its flags.
- Create a remote branch linked to an issue from `dev`: `gh issue develop <number> --repo chester-hill-solutions/callcaster --base dev --name feature/<number>-<kebab-description>`. Use `feature/` for implementation work; reserve `chore/<kebab-description>` for repository maintenance that is not the issue's product work.
- Use a separate worktree for the linked branch. Fetch an explicit remote-tracking ref, then create the local tracking branch: `git fetch origin <branch>:refs/remotes/origin/<branch>` followed by `git worktree add --track -b <branch> ../<worktree-name> origin/<branch>`. Name the worktree after the branch without slashes, for example `../feature-1157-build-ai-test-audiences`.
- For an unlinked chore branch, create the worktree from `dev`: `git worktree add -b chore/<kebab-description> ../chore-<kebab-description> dev`. After verification, commit, push with `git push -u origin <branch>`, and create the review with `gh pr create --repo chester-hill-solutions/callcaster --base dev --head <branch>`.

## Changelog

- Every PR that changes app behavior adds one line under `## [Unreleased]` in `docs/CHANGELOG.md` (Added / Changed / Fixed / Removed / Security), phrased for a customer or operator, linking the PR and the issue. Do this in the same PR as the change.
- A dev → master release PR renames the Unreleased section to `## YYYY-MM-DD — release #<PR>` and adds a fresh empty `## [Unreleased]` above it. CI enforces this on pull requests into `master` (`npm run check:changelog -- --base origin/master` locally); PRs into `dev` are not gated.

## Verification

After a mutation, query the target object and report its URL plus the fields that changed. Do not treat successful command exit status as sufficient proof of remote state.

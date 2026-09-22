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
6. For pull request work, load the `github-pull-request` skill in addition to this skill.
7. For issue type, parent/child, or dependency work, load the `github-issues` skill in addition to this skill.
8. For project-board work, load the `github-projects` skill in addition to this skill.
9. For branch and commit work, load the `git` skill in addition to this skill.
10. When an error reveals missing reusable guidance, update the relevant skill in the same task. Do not create one-off incident logs.

## Rate Limits And REST Fallback

`gh` uses GraphQL for `pr create`, `pr view`, `pr checks --watch`, `issue create`, most `project` commands, and repo navigation. Its GraphQL bucket exhausts much faster than the REST bucket during long automation sessions — a queue of PRs (create, watch checks, move project items, merge) can hit `API rate limit already exceeded` mid-flight and stall the pipeline.

1. Use REST for high-frequency work once a session is underway: `gh api repos/{owner}/{repo}/pulls`, `.../issues`, `.../commits/{sha}/check-runs`, `.../commits/{sha}/status`, and `.../git/refs/heads/{branch}` (delete). For mutations with a markdown body, build JSON with `jq -n --rawfile body <file> ...` and pass `--input` — never inline a markdown body into a double-quoted shell arg (backticks execute).
2. Poll checks with REST, not `gh pr checks --watch` (GraphQL): `commits/{sha}/check-runs` (quality conclusion) + `commits/{sha}/status` (combined — includes the Railway deploy contexts). Both green means merge-ready.
3. Reserve GraphQL for what REST cannot do: `gh project item-edit` Status moves and `projectItems` queries.
4. When `gh pr create` / `gh pr merge` hit `graphql_rate_limit`, fall back to REST: `POST /repos/{owner}/{repo}/pulls` (create; ensure the head branch has commits ahead of base first — "No commits between base and head" is the failure when it does not), `PUT /repos/{owner}/{repo}/pulls/{n}/merge` with `-f merge_method=squash`, and `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`.
5. Verify REST fallbacks the same as any mutation: query the remote state and report it.

## Authentication And Scopes

Use `gh auth refresh -s <scope>` only when the operation requires an additional scope. Project mutations commonly require `project`; do not expose tokens in commands, logs, or issue bodies.

## Project Effort Field

- In CallCaster, `Effort` is a custom field on the CHS Backlog GitHub Project (`9`), not an issue label. Never use `gh issue list --label "effort:<value>"` to select work by effort.
- Load `github-projects`, then inspect the field with `gh project field-list 9 --owner chester-hill-solutions --format json` and the item values with `gh project item-list 9 --owner chester-hill-solutions --field Effort`. Filter the returned project items to `chester-hill-solutions/callcaster` before acting on an issue.

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

For pull requests and projects, follow the dedicated skill workflows before using their mutation commands.

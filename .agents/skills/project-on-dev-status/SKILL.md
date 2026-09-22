---
name: project-on-dev-status
description: "Use when a PR that references issue(s) (via 'Fixes #N' / 'Closes #N' OR this repo's bare 'Issues: #N, #N' convention) merges into dev and the linked issues need their CHS backlog (project 9) Status moved to 'on-dev' from the CLI. Trigger words: mark issues on-dev, move issue status, on-dev Status, kanban idea, why is this still on Backlog."
---

# Move merged-to-dev issues to the on-dev Status (CLI)

The repo workflow [`.github/workflows/issue-on-dev.yml`](../../.github/workflows/issue-on-dev.yml)
moves the CHS backlog Status to `on-dev` via `gh project item-edit` on every dev-merge
PR, and comments on each referenced issue (no label — #1822). Its project move runs
**only when** `vars.ON_DEV_PROJECT_NUMBER` and `secrets.PROJECT_TOKEN` are set; otherwise
it logs and just comments. The Status **option name is the project's lowercase `on-dev`**
(`vars.ON_DEV_STATUS_VALUE`, default `on-dev`): a stale value like `"On dev"` fails the
option lookup and skips the move silently while the comment still lands — the #1822
failure shape. This skill is the CLI fallback that does the Status move when the
workflow's `PROJECT_TOKEN` isn't configured (or when you want to backfill a merge the
automation missed).

Extends `github-cli` and `github-issues` — apply their auth/repo rules first.

## Prerequisites

- `gh` authenticated with a token that has the **`project` scope** (verified: current
  token has it). A GITHUB_TOKEN from Actions cannot write org projects — do NOT run this
  in a workflow with `github.token`.
- Target project facts (verified 2026-09-15, project re-verifiable below):
  - Project: **CHS backlog**, number **9** (org `chester-hill-solutions`)
  - Status field id: `PVTSSF_lADOCNShUM4BeArizhYeBKI`
  - `on-dev` option id: `9fd67429` · `Backlog` option id: `f75ad846` ·
    `tested-on-dev` option id: `eaff2ab1`

Re-verify if the project or options change:

```bash
gh project list --owner chester-hill-solutions --format json
gh project field-list 9 --owner chester-hill-solutions --format json \
  | jq -r '.fields[] | select(.name=="Status") | "field \(.id)\n" + ([.options[].name] | join(", "))'
```

## When to use

A PR has **merged into `dev`** (not master), its body or commit references issue(s) with
a closing keyword, and the issues still sit on Backlog. Typical trigger: the user asks
"why is this still on the backlog" or you see the `on-dev` label comment but no Status move.

## Steps

1. Find the merged PR and its issues (repo: `chester-hill-solutions/callcaster`).

   This repo's merged PRs usually reference issues two ways — either a closing keyword
   (`Fixes #N` / `Closes #N`, handled) or a bare **`Issues: #N, #N`** line (the common
   convention in codex-sourced fixes, which GitHub's auto-close and the workflow's
   keyword regex do NOT catch). Parse both. Note: keep the final `sort` INSIDE the
   `$(...)` — writing `issues=$(...) | sort` forks the assignment into a subshell and
   leaves `issues` empty in the current shell.

```bash
pr=1798   # the merged PR into dev
body=$(gh pr view "$pr" --json body --jq .body 2>/dev/null | tr -d '\r' | tr '[:upper:]' '[:lower:]')
issues=$(
  { printf '%s' "$body" \
      | grep -oE '\b(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b[[:space:]]*:?[[:space:]]*#[0-9]+' \
      | grep -oE '[0-9]+$'; \
    printf '%s\n' "$body" \
      | grep -oE '\bissues?[[:space:]]*:?[[:space:]]*#[0-9]+([[:space:],]+#?[0-9]+)*' \
      | grep -oE '#[0-9]+' \
      | grep -oE '[0-9]+$'; } \
  | sort -un
)
echo "$issues"
```

   Verify each issue is still open (a closed one already finished promotion):

```bash
for n in $issues; do gh issue view "$n" --json state --jq '.state'; done
```

2. Resolve each issue's item id on project 9. **Use GraphQL, not `item-list`**:
   `item-list --limit 1000` inconsistently drops items based on `content.number`,
   even for issues that ARE on the project (observed 2026-09-15: 4 of 6 target items
   returned "no item" via item-list; all resolved via projectItems GraphQL). One
   issue → one item id (first project-9 item; multi-item issues are not expected here):

```bash
gh api graphql -f query='query { repository(owner: "chester-hill-solutions", name: "callcaster") { issue(number: <n>) { projectItems(first: 5) { nodes { id project { number } } } } } }' \
  | jq -r '[.data.repository.issue.projectItems.nodes[] | select(.project.number == 9) | .id][0]'
```

   Issues not on project 9 return nothing — skip them (they have no Status to move).

3. Move each item to `on-dev`:

```bash
gh project item-edit --project-id PVT_kwDOCNShUM4BeAri \
  --id '<item-id>' --field-id PVTSSF_lADOCNShUM4BeArizhYeBKI \
  --single-select-option-id 9fd67429
```

## Verification

- Via GraphQL (authoritative — same route as the lookup):

```bash
gh api graphql -f query='query { repository(owner: "chester-hill-solutions", name: "callcaster") { issue(number: <n>) { projectItems(first: 5) { nodes { project { number } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }'
```

  Expect `fieldValueByName(name:"Status").name == "on-dev"` on the project-9 node.
- `gh project item-list 9 ... --limit 1000` is fine as a cross-check but can report
  "no item" for issues that ARE on the project — treat a miss as inconclusive.

## Hazards

- **Never use this to set Status to a terminal lane** (`archive`, or any "closed/live"
  meaning). Its only job is the transient `on-dev` state during review.
- Only move after the PR is **actually merged to dev** (check `gh pr view --json state` ==
  MERGED). A draft or unmerged PR that merely *references* an issue must not move it.
- Reinstate `Backlog` if the change is reverted off dev (`f75ad846`).
- **Do not add any "on-dev" label** — the project Status is the only mechanism for
  signalling "fix on dev" (#1822). The workflow comments only; it sets Status when
  configured, and this skill backfills it. A label adds noise with no kanban effect.
- **The Status option is lowercase `on-dev`, not `On dev`.** A stale
  `ON_DEV_STATUS_VALUE` makes `gh project item-edit`'s option lookup fail; the workflow
  logs "option not found" and skips the move while the comment still posts (#1822).
- One logical concern per run: move only the issues referenced by the merged PR in
  question. Do not sweep unrelated issues you happen to notice on Backlog.

## Related

- Next states: `tested-on-dev` (`eaff2ab1`) when QA confirms on the review env. When the
  fix is promoted to master the release PR's `Closes #N` closes the issue, and the
  project's **"Item closed" automation** moves the item to `on-qa` (`98236657`) by itself.
  Do NOT move closed items manually — only a closed issue whose state reason is
  `not_planned` or `duplicate` goes to `archive` (`2441cbb1`) by hand.
- `ON_DEV_PROJECT_NUMBER=9`, `PROJECT_TOKEN`, and `ON_DEV_STATUS_VALUE=on-dev` are set,
  so the workflow moves the Status automatically. Keep this skill for backfilling merges
  the automation missed (or while the token is unset).
- Options on the live project (2026-09-22): `Backlog f75ad846`, `In progress 47fc9ee4`,
  `on-dev 9fd67429`, `tested-on-dev eaff2ab1`, `on-qa 98236657`, `on-prod 2f691958`,
  `archive 2441cbb1` — mirrored in `.github/projects.yaml`.
# Protocol: verifying a sweep of claimed fixes

This is the procedure behind [SKILL.md](SKILL.md). It exists because a sweep once closed
94 issues and marked them `on-prod` on the strength of "a commit citing the issue reached
master", and the operator could no longer tell what was actually done.

## 1. Build the audit set

Two populations, both from the CHS backlog (project 9), filtered to this repository:

- **Issues the bot closed.** Every issue closed by the bot account. These carry the
  automated sweep's judgement and are the ones most likely to be wrong.
- **Issues closed but not at `on-prod`.** The operator's own corrections, and issues a
  sweep closed without promoting.

For each issue, gather:

- the title, the full body (the symptom), the labels
- the current issue state and the current project Status
- the cross-referenced pull requests from the issue timeline
- the commits in `origin/master` whose subject names the issue, and the merge commits for
  the cross-referenced PRs

Write a brief per issue:

```json
{
  "issue": 2507,
  "title": "...",
  "symptom": "the issue body",
  "current_status": "on-prod",
  "current_state": "CLOSED",
  "candidate_commits": [{ "sha": "abc1234", "subject": "..." }],
  "candidate_pr_commits": [{ "pr": 2486, "sha": "def5678", "subject": "..." }]
}
```

Candidates are **hints**. A release squash commit names 18 issues and fixes 18 unrelated
things; the verifier must narrow it to the mechanism.

## 2. Verify, in parallel

Split the set into batches of about ten and delegate each batch. Each verifier reads
[SKILL.md](SKILL.md), then for every issue in its batch:

1. reads the brief,
2. reads the candidate diff (`git show <sha>`, narrowed by path),
3. finds the mechanism that would resolve the symptom,
4. decides `VERIFIED` / `PARTIAL` / `NOT_FIXED`,
5. sets the `manual` flag,
6. writes `<verdicts>/<issue>.json`.

Hard rules for the verifier:

- **Never guess.** A verdict without a `file:line` or a quoted diff hunk is rejected. If
  the code cannot be found, the verdict is `NOT_FIXED` and the note says what was searched.
- **Confirm the change is in `origin/master`.** A fix on a branch that was never promoted
  is `NOT_FIXED`.
- **Do not touch GitHub state.** The verifier reads and writes local files only. Applying
  verdicts is a separate, reviewable step.

## 3. Apply

`.opencode/tools/apply-issue-verdicts.mjs` maps a verdict to an issue state and a project
Status, and writes the comment that explains a reopen. Dry run first, read the plan, then
apply.

## 4. Report

Report the counts by verdict and by planned action, and name the issues that changed
state. The operator reads the project Status, so the report's job is to say what the
Status now means.

## 5. Record it

Write the sweep into the board's enrichment records
([`scripts/issue-board-enrichment/`](../../../scripts/issue-board-enrichment/)) so the
regenerated board carries the verdict and the evidence, not just a lane name. A reopened
issue lands in a lane the operator can act on:

| Verdict | Lane |
|---|---|
| `VERIFIED` + `manual: true` | `verify-close` — the fix is in, a person must confirm it |
| `PARTIAL` | `fix-now` — the resolution path is known |
| `NOT_FIXED` | `fix-now` if the root cause is known, otherwise `needs-repro` |

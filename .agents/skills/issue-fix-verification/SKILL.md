---
name: issue-fix-verification
description: "Use when closing CHS backlog issues automatically, when deciding whether an issue's fix actually works, or when moving issues between Backlog / on-dev / tested-on-dev / on-qa / on-prod. Covers why 'a commit reached master' is NOT proof of a fix, the VERIFIED / PARTIAL / NOT_FIXED verdicts, the manual-test flag, and the close/reopen/status rules. Trigger words: close issues, sweep the backlog, verify the fix, move to on-prod, issue status, are these actually fixed, reopen wrongly closed."
---

# Verify a fix before you close an issue

## The rule

**An issue is closed because the code was verified to resolve the reported symptom — not
because a commit that mentions the issue number reached `master`.**

The old sweep closed an issue when a commit citing it was an ancestor of `master`. That is a
statement about the repository, not about the product. A commit can be merged, released,
and still not fix the symptom the user reported. It happened at scale: a single sweep
closed 94 issues and marked them `on-prod`, and a release closed 17 more, all on the
strength of "the code is in master". Most of those were fine. Some were not — #2507 was
closed with the toast still in the code, #2503 was closed with the duplicate headings
still on the page.

The operator reads the project Status to know what is actually done. A wrongly closed
issue at `on-prod` is worse than an open issue, because it hides work that was never done.

## Never use these as proof

| Signal | Why it fails |
|---|---|
| `git log --grep="#N"` finds a commit | 28 of 29 issues in one sweep had no commit citing them; the fix landed under a PR number. Grep the code and the test names instead. |
| The commit is an ancestor of `master` | Says the change shipped. Says nothing about whether it addresses the symptom. |
| The PR is titled `fix(#N)` | A claim, not evidence. Read the diff. |
| The issue was closed by a release PR | Releases close on a keyword, not on a check. |

## The verdicts

| Verdict | Meaning |
|---|---|
| `VERIFIED` | The code in `origin/master` demonstrably implements the behaviour the issue asks for. |
| `PARTIAL` | The code addresses part of the symptom only. |
| `NOT_FIXED` | Nothing in `origin/master` addresses the symptom. |

Every verdict cites `file:line` or a quoted diff hunk. A verdict without a code citation
is not a verdict.

## The `manual` flag

`manual: false` — a machine can confirm the symptom is gone. A unit test, an integration
test, a browser test, or reading the code is enough. Most UI defects are in this class.

`manual: true` — only a person can confirm the symptom is gone:

- a real SMS arriving on a real handset, at a real pace
- a real phone call: dialling, ringing, answering, hanging up, recording, voicemail
- a real email landing in a real inbox (password reset, verification, receipt)
- a real Stripe receipt or a real credit balance
- a real browser crash, a CPU or memory spike, or perceived slowness
- a number a human reads and judges ("the IVR estimate is too low")

`manual: true` does not mean the fix is bad. It means the evidence stops at the code.

## How to verify one issue

1. Read the symptom from the issue body. Read the whole body; the symptom is often in the
   reproduction steps, not the title.
2. Find candidate commits. Cross-referenced PRs from the issue timeline are the best
   pointer; a PR whose title carries the issue number is a better one. `git log
   origin/master --grep="#N"` is a hint, not a search.
3. Read the diff: `git show <sha>`, narrowed with `git show <sha> -- <path>`.
4. Confirm the change is an ancestor of `origin/master`. A fix on a branch that was never
   promoted is `NOT_FIXED`.
5. Look for the test that covers it. A change with no test is weaker evidence, not
   disqualifying — say so.
6. Write the verdict to `<verdicts>/<issue>.json`:

```json
{
  "issue": 2507,
  "verdict": "NOT_FIXED",
  "manual": false,
  "remaining": "code",
  "mechanism": "one sentence: what the code now does",
  "evidence": ["app/routes/x.ts:42 — the guard that returns early"],
  "in_master": true,
  "test": "test/x.test.ts — the case that would fail without it",
  "note": "anything the reader needs"
}
```

`remaining` is optional. It is `"person"` when what is left is a person's action on master,
and `"code"` when there is still code to write. It decides whether a partial or not-fixed
issue lands in `on-qa` or in `In progress`.

The full protocol, including how to delegate the sweep in parallel, is in
[PROTOCOL.md](PROTOCOL.md).

## How to apply a verdict

Use the tool: `.opencode/tools/apply-issue-verdicts.mjs`. It is dry-run by default.

```bash
node .opencode/tools/apply-issue-verdicts.mjs --verdicts <dir>          # plan
node .opencode/tools/apply-issue-verdicts.mjs --verdicts <dir> --apply  # write
```

The rules it applies:

| Verdict | Issue state | Status |
|---|---|---|
| `VERIFIED`, machine-checkable | close if open | `on-prod` if already there, else `on-dev` — **the operator promotes to `on-prod` by hand** |
| `VERIFIED`, `manual: true` | reopen | `on-qa` |
| `PARTIAL` / `NOT_FIXED`, `remaining: "person"` | reopen | `on-qa` |
| `PARTIAL` / `NOT_FIXED`, `remaining: "code"` | reopen | `on-dev`, or `In progress` when no fix exists anywhere |

**The Status follows the remaining work, not the verdict label.** A verdict can carry
`"remaining": "person"` or `"remaining": "code"`. When what is left is a person's action on
master — register a number, make a call, read a number — the issue belongs in `on-qa` with the
other verification work. When it is code, it belongs in `In progress`. #2519 is the case in
point: the code is in master and complete, but production still has no verification number, so
the operator has to register one and place a call. Calling that "needs code work" would send
an engineer looking for code that does not need writing.

## Projects access fallback

The verdict CLI needs Projects API read access even in dry run. If the token
lacks that access, keep the JSON verdict and read the issue and its live Project
Status in an authenticated browser. For an already-authorized single-item change,
apply the same verdict table there. Read the current options, update only the
verified issue, then check its state and Status and save a screenshot. Keep the
operator promotion rule below: preserve `on-prod` only when it was already set.

## The rules the operator set

- **Do not set `on-prod`.** The operator moves verified issues to `on-prod` themselves, so
  the `on-prod` population only ever contains what they promoted. The bot closes the
  verified ones and leaves them in `on-dev`.
- **Do not close an issue that needs a physical test.** The operator verifies those by
  hand. They go to `on-qa` and stay open.
- **A reopened issue gets a comment** with the verdict and the evidence, so the reason is
  on the issue and not only in a report.

## Gotchas

- **GitHub closes one issue per closing keyword.** `Closes #1, #2` closes only #1. The
  release gate enforces one keyword per issue
  ([`scripts/check-release-closing-references.mjs`](../../../scripts/check-release-closing-references.mjs)).
- **`Closes #N` on an issue that is already closed does nothing.** To move an issue's
  status you set the project field; the issue state and the project Status are separate.
- **A parent issue with an open sub-issue stays open** when the parent is closed by a
  keyword. That is GitHub's rule, not a failure.
- **GitHub's REST API intermittently reports "rate limit exceeded" while `gh api` works.**
  Drive mutations over REST with `gh api`, and paginate explicitly.
- **The board mixes CHS products.** Filter by repository before touching a Status.

# CallCaster repository and issue review

Checked on 2026-10-02 against `origin/dev@5b673c81` and `origin/master@e3a1f002`. Local `dev` and `master` now match those remote tips. The main checkout has no tracked changes. The saved local commit and all changed Stow files are preserved.

Cleanup removed 21 stale worktree records, four clean worktrees, 18 local branches and 22 remote branches. Every deleted branch was checked against a shipped PR or current trunk ancestry. A verified Git bundle preserves the original refs.

## Local and remote state

| Item | Result |
| --- | --- |
| Remote | One remote: `origin`, `https://github.com/chester-hill-solutions/callcaster.git` |
| Default branch | `master` is the release branch; `dev` is trunk |
| Main checkout before cleanup | `dev@2626dda5`: one local commit, 220 commits behind the final dev snapshot |
| Main checkout after cleanup | `dev@5b673c81`, matching origin/dev |
| Release checkout | Local master matches origin/master |
| Release gap | master has three commits absent from dev; dev has 126 absent from master. Do not treat the count as 126 unreleased features |
| Remaining local branches | 33 including dev, master, the saved branch and this maintenance branch |
| Remaining remote branches | 15 including dev and master |
| Open PRs | None in the final PR snapshot. PRs #2250 and #2251 merged during this review |

## Preserved work

- `archive/dev-saved-2026-09-30` preserves `2626dda5`. This saved commit changes 23 files. Review it against current dev before any cherry-pick; later PRs changed the same areas.
- `/Users/ladmin/.codex/worktrees/stow-minio-cleanup/callcaster` retains five changed files: Makefile, object-storage.server.ts, two interactive-SMS documents, and voicemail-setup.spec.ts. Its branch is `chore/1800-stow-replaces-minio`.
- Three removed clean worktrees had branches without verified merge evidence: `feature/2146-ivr-documented-option-matching`, `fix/2082-a2p-campaign-submission`, and `fix/2083-toll-free-send-gate-fail-closed`. Their branch tips are still present.
- `.cursor/` and `.opencode/plans/` are now visible as untracked files in the main checkout. They existed under the old ignore rules. The newer dev branch tracks local tooling folders. These files were left in place.
- Other unmatched branch tips remain. Some old merged PRs have merge commits outside the current dev and master history. Their merged state alone was not used as proof that their work is in current code.

## Issue board result

283 issues are open in the live issue snapshot. The local board now uses current issue state, labels and assignees. It is saved on `chore/repo-state-2026-10-02` in this maintenance worktree.

| Lane | Issues |
| --- | --- |
| fix-now | 101 |
| verify-close | 92 |
| needs-repro | 10 |
| needs-decision | 41 |
| blocked-epic | 32 |
| duplicate | 3 |
| needs-triage | 4 |

Six entries moved from Fix now to Verify and close: #1875, #2005, #2013, #2041, #2054 and #2147. #2178 now has a verification record. Closed enrichment records for #1356, #2081, #2101, #2120, #2126, #2135 and #2208 were pruned. The closed #1356 dependency was removed from #1827. No GitHub issue was closed or changed by this review.

The normal `npm run tools:issues:board` query failed because the token lacks `read:project`. The fallback used the same board generator with live issue data. Eight IN PROGRESS markers were retained from the prior committed board and explicitly marked as not refreshed. This is not a review of live project status.

## Code evidence and next work

| Issue | Current code evidence | Next step |
| --- | --- |
| [#2082](https://github.com/chester-hill-solutions/callcaster/issues/2082) | `app/lib/twilio-a2p.server.ts` still uses `messagingApi?.campaigns?.create`. A local candidate branch is preserved | Review that branch against current dev and verify actual campaign creation |
| [#2083](https://github.com/chester-hill-solutions/callcaster/issues/2083) | `twilio-toll-free.server.ts` still turns a list error into an empty list and excludes unknown status from blocking. A local candidate branch is preserved | Review that branch; test missing verification and provider error before the send |
| [#2130](https://github.com/chester-hill-solutions/callcaster/issues/2130) | `acd-router.server.ts` claims an agent, checks credentials, and returns hold music when credentials are absent. No release appears in that branch | Reproduce the missing-credentials case; release the claim and agent |
| [#2129](https://github.com/chester-hill-solutions/callcaster/issues/2129) | The July 5 guard SQL exists, but both bootstrap scripts list it as coveredByBaseline. The baseline lacks its index and claim function. The applied July 31 claim definition lacks its pre-check | Reproduce both database paths and repair the final migration definition. PR #2251 fixes sender ownership, not this path |
| [#2213](https://github.com/chester-hill-solutions/callcaster/issues/2213) | The temporal guard and campaign_queue, call and message type fixes are on dev. The committed baseline still contains 64 entries | Correct the remaining tables in separate PRs. The 64 count is from the file, not a new database measurement |
| [#2211](https://github.com/chester-hill-solutions/callcaster/issues/2211) | schema-default-drift.yml now boots Postgres and runs the full integration tier. Its path filters cover schema and migration changes | Review the path filters for application modules exercised by integration tests and check required-check behavior |
| [#2146](https://github.com/chester-hill-solutions/callcaster/issues/2146) | The shared ivr-option-value helper supports content/next options. PR #2199 is recorded in the existing board | Verify the read paths. Decide launch-time normalization or rejection separately |
| [#2154](https://github.com/chester-hill-solutions/callcaster/issues/2154) | splitMessageCampaign uses a transaction and defers event publication. It also holds back live claims | Keep in verification. Do not repeat the atomicity or in-flight split fixes |
| [#2239](https://github.com/chester-hill-solutions/callcaster/issues/2239) | The E2E workflow still installs ffmpeg through apt within five minutes | Reproduce the install failure before choosing a binary download or a larger time limit |

The four issues without enrichment are #2239, #2176, #1832 and #1668. They remain in Needs triage. They were not assigned a verdict from their title alone.

## Checks and limits

- Git recovery bundle verified. Branch tips were checked before removal. Remote deletion results were read back from GitHub.
- The issue generator validated the records, pruned closed issues and checked dependency edges. The board has one entry for each open issue.
- The new read-only Python cleanup tool parsed and ran. It found the three remaining worktrees and the saved dev branch.
- `git diff --check` is the final text check. Application tests, real-Postgres reproduction and deployed browser checks were not run. No application code changed.
- No push, PR, deployment, live ledger write or environment change was made. Full `npm run ci:local` remains required before a later push or PR.

## Recovery and repeat use

Original refs, worktree paths, branch plans and the verified bundle are in `/Users/ladmin/WebProjects/callcaster/.git/cleanup-backups/2026-10-02`. Restore a branch from its recorded SHA, or fetch a recorded bundle ref into a new recovery branch. The saved local dev commit also has its own named branch.

Run `python3 .opencode/tools/repo-cleanup-plan.py` from a checkout for a read-only inventory. Fetch remote data first when it is needed. The tool uses ancestry only. For squash merges, verify the PR head and the shipped merge commit before removal.

## Removed local branches

| Branch | Evidence |
| --- | --- |
| `bug/1699-use-recipient-ivr-wording` | PR #2072 |
| `bug/1765-hide-onboarding-credit-warning` | PR #2073 |
| `bug/1889-predictive-voicemail` | PR #1901 |
| `bug/2039-fix-number-success-alert` | PR #2071 |
| `bug/2040-fix-sms-contact-create` | PR #2070 |
| `bug/2048-settled-sms-completion` | PR #2050 |
| `bug/2049-persist-twilio-send-time` | PR #2055 |
| `change/2014-transient-notification-toasts` | PR #2037 |
| `chore/issue-board-post-merge` | Ancestor of origin/dev |
| `codex/1854-public-api-ivr-steering` | PR #1904 |
| `codex/ivr-no-input-answer-2147` | PR #2163 |
| `codex/live-readiness` | Ancestor of origin/dev |
| `feature/1875-ivr-speech-result-confidence` | PR #2160 |
| `feature/2035-confirm-leave-campaign` | PR #2074 |
| `fix/1782-ivr-send-window-boundary` | PR #2162 |
| `task/1356-point-dev-env-to-dev-subdomain` | PR #2056 |
| `test/1794-schedule-sync-interleaving` | PR #2159 |
| `test/1869-test-call-queue-isolation` | PR #1900 |

## Removed remote branches

| Branch | Evidence |
| --- | --- |
| `bug/1705-stronger-primary-hover` | PR #2021 |
| `bug/1763-number-onboarding-breadcrumbs` | PR #2020 |
| `bug/1864-ivr-amd-before-flow` | PR #1867 |
| `bug/2010-auth-page-scrollbar` | PR #2023 |
| `bug/2012-signup-heading` | PR #2025 |
| `bug/2013-auth-form-alignment` | PR #2024 |
| `change/1719-messages-fit-viewport` | PR #2016 |
| `chore/dedupe-queue-item-type` | PR #2240 |
| `chore/document-project-effort-field` | PR #2017 |
| `chore/local-calling-dev-host` | PR #1866 |
| `feature/1205-guided-phone-setup` | PR #1746 |
| `feature/1745-actionable-setup-review` | PR #1747 |
| `feature/1839-voicemail-drop-toggle` | PR #1860 |
| `feature/2001-phone-numbers-page` | PR #2018 |
| `merge/master-into-dev` | PR #1652 |
| `task/1702-ivr-answer-label-tooltip` | PR #1946 |
| `task/1810-board-followup` | PR #1947 |
| `task/1810-board-followup-2` | PR #1948 |
| `task/1810-refresh-issue-board` | PR #1945 |
| `task/1939-unscoped-client-ban-app-lib` | PR #1943 |
| `task/1940-middleware-scoped-tenant-client` | PR #1941 |
| `task/1942-ratchet-base-db-client` | PR #1944 |

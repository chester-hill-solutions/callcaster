# Code scan — 2026-09-12

Scanned `dev@4d2cd5a8efa298078659fbd63c9eb643e4b1ea1e`.

Result: **seven new Bug tickets** (four high, three medium), plus new reproduction evidence on **#1782**. All remote ticket types and changes were read back with `gh` after writing.

## Findings

| Priority | Ticket | Finding | Evidence |
|---|---|---|---|
| High | [#1791](https://github.com/chester-hill-solutions/callcaster/issues/1791) | SMS sends continue after a campaign window closes. | Real coordinator and real window function: a 21:00 close still allowed a send at 21:00:00.250. |
| High | [#1792](https://github.com/chester-hill-solutions/callcaster/issues/1792) | SMS pacing does not carry across batch boundaries. | One-MPS target; two send starts had a 0-ms gap. |
| High | [#1793](https://github.com/chester-hill-solutions/callcaster/issues/1793) | Deferred queue rows block later eligible contacts. | Two ticks revisit the same deferred row; the eligible row receives no turn. The same slice-before-gate pattern exists in voice. |
| High | [#1794](https://github.com/chester-hill-solutions/callcaster/issues/1794) | Schedule sync can overwrite a concurrent pause or completion. | Code-traced race: the status UPDATE has no original-status predicate. A database concurrency test is still needed. |
| Medium | [#1788](https://github.com/chester-hill-solutions/callcaster/issues/1788) | SMS export adds a false skipped row for a sent contact. | CSV contains both delivered and skipped rows, with skip reason `SMS message sent`. |
| Medium | [#1789](https://github.com/chester-hill-solutions/callcaster/issues/1789) | Voice export uses the retired credit rate. | A 90-second IVR call exports 2 credits; the shared rate card requires 5. This is an export defect, not evidence of a wrong debit. |
| Medium | [#1790](https://github.com/chester-hill-solutions/callcaster/issues/1790) | IVR campaign types are rejected by export adapters. | Both `simple_ivr` and `complex_ivr` return HTTP 400 after campaign lookup succeeds. |
| Existing | [#1782](https://github.com/chester-hill-solutions/callcaster/issues/1782#issuecomment-5645594003) | Voice window resume uses a fixed 15-minute delay. | At 14:00, a waiting campaign with a 14:05 opening gets a 14:15 successor. Deployed verification remains pending. |

Each new ticket contains source links pinned to the reviewed commit, the cause, impact, reproduction or code evidence, and acceptance criteria. Each fix should be one PR.

## Checks

- Typecheck: passed.
- Lint: passed, with **0 errors and 347 warnings**.
- Node Vitest suite: 3,181 passed, 11 skipped; nine socket tests initially failed because the sandbox blocked the test listener. All nine passed when rerun with local socket access. Total node tests passed: **3,190**.
- UI suite: **829 passed**.
- Bun runtime, webhook, and vendored script-core tests: **22 passed**.
- Total existing tests passed across these runs: **4,041**. This is an aggregate, not a claim that the first `npm test` run was green.
- Twelve structural checks passed. See [guard-results.json](guard-results.json). The queue guard retains five baseline drift entries; the webhook guard retains two metadata warnings for routes that do validate signatures.
- Eight focused regression assertions failed as expected, covering six new bugs and the existing voice-delay issue. See [reproduction-output.txt](reproduction-output.txt).
- Full `ci:local`, production build, browser E2E, and live provider/production database tests were not run. No push or PR was made.

## Scope and limits

The scan combined tooling, source searches, and focused review of campaign dispatch, queue selection, scheduling, exports, invitation handling, and worker error paths. Route membership, role checks, request-body use, redirects, credit writes, and database RPC contracts were checked with the existing guards. Deprecated Twilio Serverless code was excluded.

This is not proof that the whole repository is free of other defects. Tests used synthetic data and mocked external boundaries. The schedule race is based on the actual read/write predicates; it was not reproduced against a live database.

## Reproduce the findings

[reproductions.patch](reproductions.patch) adds only the focused checks to the existing three test harnesses. The temporary test copies were removed after the run. App source and the normal test files were left unchanged.

Apply the patch in a separate checkout at the reviewed commit:

```sh
git apply /absolute/path/to/reproductions.patch
./node_modules/.bin/vitest run -c vitest.node.config.ts \
  test/campaign-sms-dispatch-contract.test.ts \
  test/campaign-export-contract.test.ts \
  test/campaign-dispatch-worker.test.ts -t 'SCAN:'
```

The eight assertions should fail on the reviewed code. These are audit probes built on existing mocks. Before merging fixes, make permanent regression tests follow the current mock and type rules, and add the missing database interleaving test for #1794.

## Issue board

Added the seven new issues and the confirmed #1782 finding to `scripts/issue-board-enrichment/fix-now.json`.

The `npm run tools:issues:board` refresh was blocked because this machine's GitHub token lacks `read:project`. The command failed before any board write. `ISSUE_BOARD.md` remains unchanged. GitHub ticket creation and updates succeeded with the existing repository scope.

## Delegated implementation

Three task-sized fixes were implemented in the shared worktree after the scan:

- #1791: recheck the SMS campaign window before each provider send.
- #1788: omit the synthetic skipped row for a successful SMS dequeue.
- #1794: make schedule status changes conditional on the observed status.
- #1792: preserve SMS send-start pacing across queue batches.
- #1793: scan recipient-window eligibility before applying the SMS or IVR batch cap.
- #1789: calculate voice export credits from the shared billing rate card.
- #1790: allow `simple_ivr` and `complex_ivr` through all export adapters.
- #1782: schedule voice successors at the next calling-hours boundary, with a bounded fallback.

Focused validation passed for all eight changes. The #1793 regression covers a deferred queue head followed by an eligible contact in both SMS and IVR. The #1782 regression verifies a 14:00 wake for a 14:05 opening. The changes remain uncommitted for parent review.

## Next work

1. Fix the remaining high-priority dispatch/state bugs in separate PRs.
2. Fix the three export bugs with the saved regression cases.
3. Finish the deployed voice-window verification in #1782 after its wake-time fix.

The existing sweep and issue skills cover this workflow. The saved reproduction patch prevents rediscovery; no additional skill or command is needed.

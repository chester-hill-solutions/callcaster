# E2E nitpick remediation — status

Branch: merged to `dev` as #1052 (`4bc2d032`).
Companion plans: original audit plan removed after landing; follow-up open work is in
[`e2e-nitpick-followup-remediation-plan-2026-07-15.md`](./e2e-nitpick-followup-remediation-plan-2026-07-15.md).

**Read this before implementing anything from the plan.** The audit's *symptoms*
were reliable. Its *diagnoses* frequently were not — roughly half of those checked
were wrong, and two would have caused real damage if implemented literally.

## Corrections to the plan

| Finding | Plan said | Reality |
|---|---|---|
| SEC-01 | omit `authToken`, `token`, `stripe_id`, `twilio_data` | `authToken` is **not a column** (it lives inside the `twilio_data` JSON), and the list **missed `key`** — the SID half of the Twilio API key pair (ADR-0011). Implementing the list verbatim would have shipped a projection that still leaked half a credential, with a passing test asserting the leak was fixed. |
| JOURNEY-01 | `routeData()` deferred wiring is broken | `routeData` is just an alias of RR's `data`. RR 8.2 streams promises natively; the `<Suspense>`/`<Await>` wiring is correct. The real bug was in `entry.server.tsx`. |
| JOURNEY-02 | gate the header join CTA on `joinDisabled` (`CampaignHeader.tsx`) | `CampaignHeader` has **no join CTA**. The real CTAs (`CampaignNav`, `CampaignInstructions`) already gate correctly. Nothing to fix. |
| JOURNEY-05 | error route uses `Buffer`; replace with `atob`/`btoa` | The error route never touches `Buffer`. `ErrorShell` renders its own `<head>` and omitted the `buffer-polyfill.mjs` script that the normal layout loads, while still rendering `<Scripts />`. |
| A11Y-01 | active sidebar item is low-contrast in dark mode | **Inverted.** That element is 6.6:1 and passes AA — pale text on a dark surface is *high* contrast. The real failure was `Navbar`'s user-menu button at ~1.37:1. |
| A11Y-02 | Settings gear is unlabeled | No icon-only Settings gear exists; the only one has visible text. |
| UX-08 / UX-10 | missing `aria-invalid`; missing `role`/`aria-valuenow` | Both real, both different causes. `aria-describedby` sat on a wrapper `<div>` (announcing nothing) and was unused by every call site. `progress.tsx` never forwarded `value` to Radix's Root. |
| UX-01 | SMS settings show the wrong label | True, but the screen edits `campaign.schedule` — a different field entirely. See the `sms_send_window` gap below. |
| UX-09 | marketing chrome bleeds into `/workspaces/*` | **Not a bug — deliberate.** `Navbar` is one global nav that adapts: it takes `params`, derives `workspaceId` (`Navbar.tsx:160`) and renders workspace links when inside a workspace (`:130`). Hiding it under `/workspaces/*` would be the regression. No change made. |

## Landed

| Commit | Item |
|---|---|
| `3f2031f3` | Baseline unblock — circular `steps` type (dev was already red) |
| `42e63e81` | SEC-01 — workspace credential leak (KR-1) |
| `22ec99c5` | JOURNEY-02 — null `disposition_options` (KR-3) |
| `9afd1d00` | JOURNEY-03 — contacts `<Outlet/>` (KR-4) |
| `d4011baf` | JOURNEY-05 — dead link + 404 Buffer (KR-5) |
| `de006a1a` | JOURNEY-01 — SSR stream never closed (KR-2) |
| `551e3590` | JOURNEY-04 — onboarding step-1 validation |
| `47f62b79` | Wave 2a — campaign UX |
| `03ea3539` | Wave 2b — a11y |
| `a3c681a9` | Billing — payment workspace context + ledger-drift gate |

New gates: `check:workspace-projection` (wired into `ci:local`), plus
`--require-db` on `db:ledger:check`.

## Not fixed — deliberate, needs a decision

- **`app/server/db.ts:16`** — postgres configured `max: 10` with **no**
  `statement_timeout` / `connect_timeout` / `idle_timeout`. A saturated pool
  queues forever. This is the *root cause* behind JOURNEY-01; `de006a1a` only
  bounds the SSR symptom at ~6s. App-wide (workers, LISTEN/NOTIFY, bulk ops) —
  needs real workload data to size.
- **`sms_send_window` has no UI.** Enforced server-side
  (`api+/sms.action.server.ts:310`) but users cannot see or set it. Feature gap.
- **Script editor shows two Save controls when dirty.** `SaveBar` owns Cmd/Ctrl+S
  and Reset; removing it to dedupe would silently regress both. Collapsing means
  moving the shortcut into the route (risks `check:effects`).
- **Queue sort lags one click** — `getIsSorted()` read synchronously after
  `toggleSorting()`. Pre-existing; a test now pins current behavior.
- **Heading hierarchy**: `settings/numbers` has no heading at all; `WorkspaceNav`'s
  sidebar `h2` precedes the page `h1`; admin/marketing routes use raw `<h1>`;
  several panel components emit their own `h1`.

## Inherited from dev — now FIXED on this branch

`origin/dev` @ `d0b4ed48` was **red on a clean checkout**. CI last ran on dev
**2026-06-29**; both July commits (`726aa0ed`, `d0b4ed48`) went in unvalidated.
All of it is fixed here:

| Break | Cause | Fix |
|---|---|---|
| typecheck | `buildOnboardingStepsForState` required the `steps` it computes | `3f2031f3` |
| `check:effects` | 2 un-annotated effects (one from `726aa0ed`) | `817135c7` |
| `feature-flags.test.ts` | imported `bun:test`, in neither runner's list → whole file failed to load | `a117c71c` |
| `db-workspace` + `seed-workspace-sample-data` | fixtures used `user_id: "u1"`; `726aa0ed` added a UUID guard | `f11d3586` |
| `components-shared-invite-layout` | `726aa0ed` refactored MobileMenu to a controlled Radix Sheet; test never passed `open` | `a1edffa2` |

**In every case the product code was correct and the tests/annotations were
stale.** No product bug was found behind any of them, and no assertion was
weakened to get green. Three of the five trace to `726aa0ed` — a single
unvalidated commit.

Two things worth keeping:
- The "mobile menu toggles" test was **already vacuous** before it broke: it
  clicked a button and asserted nothing. It now asserts the real toggle contract.
- `test/api-auth*` and `test/media-stream-service*` are **load flakes**, not
  failures — they pass in isolation. `api-auth` is a `beforeEach` hook timeout at
  10s under contention; if CI ever shows it, it wants a longer `hookTimeout`, not
  a code change.

Note: `check:effects` rewrites `docs/effects-inventory.md` as a side effect. That
rewrite is only legitimate when it reflects newly *documented* effects (98/98 →
100/100 here). If it instead grandfathers breakage, revert it.

### Verified green (node 22.23.1, matching ci.yml)

    node vitest   271 files / 1872 passed, 9 skipped
    node bun       22 passed
    ui             66 files / 410 passed
    gates          typecheck, lint, tools:routes:verify, tools:api:surface:check,
                   check:{route-server-leaks,twilio-webhooks,request-body-consumption,
                   middleware,credit-writes,effects,type-safety,dry,handlers,
                   workspace-projection}, db:ledger:check, tools:check-file-size

`test:node` needs CI's env (this worktree has no `.env`):
`TWILIO_SID=AC_ci_test_placeholder TWILIO_AUTH_TOKEN=ci_test_placeholder` —
otherwise the bun half dies importing `server/bun.ts`.

## Wave 0 — still open, needs infra access

Not doable from a dev machine. See `docs/migration-ledger-drift.md` for the
failure mode and the diagnostic procedure.

Every deployed environment needs its migration ledger verified against the repo
and reconciled — the app cannot detect this drift on its own, and a stale ledger
RPC breaks credit purchases outright. Run per environment, after applying
migrations and before the app redeploys:

```
DATABASE_URL=<target> node scripts/db/check-migration-ledger.mjs --require-db
```

Deployment-specific state is deliberately not recorded here (this repo is
public); see the operator notes.

## UX-07 (SSE console errors) — NOT investigated

The spike was cancelled before it reported. Nothing here was changed for it and
no diagnosis was reached — do not read its absence from the fixed list as "no
issue found".

The question worth answering first, because it decides the severity: **does the
SSE endpoint hold a connection from the postgres pool?** `app/server/db.ts` sets
`max: 10` with no timeouts, so if each SSE client parks a connection, ten viewers
can exhaust the pool and every later query queues forever. If it does not, this
is most likely benign EventSource reconnect noise (browsers log a console error
on every reconnect, including normal ones) and is cosmetic.

## Not exercised

Live call screen after the join fix, survey editor / public survey, billing
purchase end-to-end (blocked on the ledger drift above), admin surfaces,
keyboard-only traversal, SSE reconnect under forced disconnect.

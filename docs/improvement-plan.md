# Improvement Plan — Regrounded in Open Issues

Companion to `docs/code-review-improvement-report.md`. That document reports what the code is. This one says what to do next, mapped onto issues that already exist.

**Two corrections to the first report are folded in. Both were mine, and both were material.**

1. **There is a send-path A2P gate.** I claimed no send path reads A2P status. `assertWorkspaceCanSendSms` is the first statement of every SMS send (`app/lib/campaign-sms-send.server.ts:100`) and it fails closed on `a2p_approved`, sender-pool drift, and toll-free verification (`app/lib/twilio-readiness.server.ts:66-88`). Chat sends call it too (`app/lib/chat-sms.server.ts:82`). My claim was wrong.
2. **A2P is already scoped away from Canada.** The `a2p_approved` predicate returns true unless `operatingCountry` is `US` or `BOTH` (`app/lib/messaging-onboarding/predicates.ts`, `a2pApplies`). Canadian workspaces are routed through toll-free verification instead. Calling this a live compliance risk for a Canadian product was the wrong finding.

Everything below is re-verified against the source.

---

# How the work is already tracked

283 open issues, refreshed at `dev@d0c96b79`. The board lanes are `Fix now` (111), `Verify and close`, `Needs reproduction`, `Needs decision`, `Blocked / split first`, and `Duplicates`.

The important finding of this pass: **the security and compliance items I flagged are already filed, are already in `Fix now`, and are more precisely described than my writeup was.** Work the board. Do not open new issues for them.

| My original claim | Real issue | Lane |
|---|---|---|
| A2P not enforced at send | **Wrong.** Gate exists at `twilio-readiness.server.ts:66-88` | n/a |
| A workspace-level gate throw dead-letters the whole queue | #2081 | Fix now |
| A2P status sync reverts to a stale approved value | #2143 | Fix now |
| A2P campaign creation calls a nonexistent SDK method | #2082 | Fix now |
| Toll-free send gate fails open | #2083 | Fix now |
| No rate limits on API-key writes | #2135 | Fix now |
| `rate_limit_bucket` never pruned, key is spoofable | #2099 | Fix now |
| `auth:register` idempotency scope is global | #2098 | Fix now |
| Ratchet guards tolerate stale entries and can grow | #2124 | Fix now |
| `check:effects` skips every `useEffect` | #2104 | Fix now |
| Duplicated IVR runtime | #1877 | Fix now |
| jscpd clone burn-down | #1892 | Fix now |
| Test echo-shape ratchet | #1931 | Fix now |
| Credit balance skips out-of-order ledger rows | #2120 | Fix now |
| MMS phantom segments in reconciliation | #2112 | Fix now |
| 0.1-credit coaching debit rejected by the integer RPC | #2101 | Fix now |
| Number purchase has no reservation or floor | #2084 | Fix now |
| Workspace row serializes Twilio tokens to the browser | #2078 | Fix now |
| Billing loader has no role gate | #2137 | Fix now |
| `addInboundQueueMember` accepts non-members | #2141 | Fix now |
| Public pricing page understates the auto-dial rate | #2102 | Fix now |
| Drizzle declares 68 timestamptz columns as `text()` | #2213 | Fix now |

The board also holds live defects I did not find at all, several of them higher severity than anything in my report: #2208 (a campaign split double-sends any contact mid-SMS-send), #2209 (#2154 atomicity), #2172/#2188 (SMS pacing), #2150 (unrecovered intent rows billed as one segment), #2115 (concurrent checkout orphans a Stripe customer).

---

# The plan

Ordered by customer harm, not by board lane. Each step names the issue, the branch, and the gate that must pass.

## Step 1 — Stop the send-path data corruption

**#2208. Splitting a campaign double-sends any contact that is mid-SMS-send.**

`selectEligibleCampaignQueueMembers` is an in-memory filter with no `claim` and no `SKIP LOCKED` (`app/lib/campaign-dispatch-queue.server.ts:12`). The dequeue happens after the Twilio call by design, for crash-safety (`app/lib/campaign-sms-send.server.ts:241-249`). So a contact in flight is still `queued` and indistinguishable from an untouched one. `splitMessageCampaign` copies it into the segment and dequeues it from the source. The in-flight send then completes against a row already dequeued.

This is guaranteed on every split overlapping a send, not a race. Double SMS to an opt-in outreach list is a compliance and cost problem.

Fix: claim the row before the provider call, using the existing `claim_*` token columns, without letting the claim write `queue_state`. Then make the split skip claimed rows and report the held-back count. Extend `reset_stale_campaign_queue_claims` to cover SMS claims.

Land it as its own PR. It touches the send hot path.

**Then #2154** (`f3c5e91b` landed part 1) for the related mid-run atomicity gap.

## Step 2 — Stop the compliance gate from burning the audience

**#2081. A workspace-level gate throw is recorded as a per-contact failure, so five ticks dead-letter the whole queue.**

`assertWorkspaceCanSendSms` throws a workspace-scoped error. Nothing catches that class, so it is absorbed as a per-member failure that increments `attempt_count` (`app/lib/campaign-sms-dispatch.server.ts:283-288,563-569`). The dead-letter sweep runs against `max_attempts = 5` in the same tick. Five ticks of a non-ready workspace flip the entire audience to `failed` with the message "Max queue attempts exceeded", and nothing was ever sent.

Fix: hoist the gate to the top of the dispatch tick and abort before any per-member work. Add an `instanceof WorkspaceSmsNotReadyError` branch in the rejection handler as defence in depth. Keep the genuine per-contact path unchanged, and prove it with a kill-check.

**Then #2082** (the A2P campaign call hits a nonexistent SDK method, so the campaign is silently never created) and **#2083** (the toll-free gate fails open when there is no TFV record or the Twilio list call errors). Both are on the Canadian path, which makes them higher priority than the A2P items.

## Step 3 — Close the abuse and leak surface

Four issues, in this order:

- **#2135** — no rate limit on any API-key write endpoint.
- **#2099** — `rate_limit_bucket` is never pruned and its key is the caller-supplied `X-Forwarded-For`, so unauthenticated callers can grow a production table without bound. This is both an abuse vector and a cost one.
- **#2098** — the `auth:register` idempotency scope is global, so a replay on a shared `Idempotency-Key` returns another caller's live access and refresh tokens. This is a token-disclosure bug, and it is the most serious auth issue in the set.
- **#2078** — admin routes serialize the full workspace row, so Twilio auth tokens, `twilio_data`, and `stripe_id` reach the browser for every workspace.
- **#2137** — the billing loader has no role gate; any member, including `caller`, reads the full credit history.
- **#2141** — `addInboundQueueMember` accepts any `user_id`, including a non-member of the workspace.

Every one of these is `Fix now`. They are independent and can run in parallel by different people.

## Step 4 — Correct the money paths

Billing is the best-engineered part of this codebase, and it still has six open defects. Fix in this order, because they compound:

- **#2213** — 68 columns across 37 tables are `text()` in Drizzle and `timestamptz` in the database, including four `campaign_queue` columns that #2208 is blocked on. The issue's own advice is right: **fix the guard first, not the columns.** Add a test that walks `information_schema` and compares `pg_typeof` against the Drizzle model. Run it to produce the authoritative list. Then correct the columns table by table, deleting each site's workaround as its table lands. Do not bundle the 68 with a feature.
- **#2101** — the 0.1-credit coaching-cue debit is rejected by the ledger RPC's integer `amount`, so every LLM coaching cue is unbilled *and* throws.
- **#2120** — `useCreditBalance` drops out-of-order ledger rows, permanently skewing the displayed balance. A customer who sees the wrong number stops trusting the number.
- **#2112** — the reconciliation side divides a mixed SMS+MMS total by the SMS per-segment rate, and the Twilio side never reads `mms-outbound`. Every MMS adds phantom segments.
- **#2084** — number purchase reads credits, calls Twilio, then debits, with no transaction, no reservation, and no balance floor.
- **#2150** — an intent row recovered by the status webhook never gets `num_segments`, so it is billed as one segment regardless of length.
- **#2102** — the public pricing page understates the auto-dial rate. A published price that does not match the invoice is a trust problem, and it is a one-line fix.

## Step 5 — Burn the ratchet baselines

**#2124** is the prerequisite: two ratcheting guards tolerate stale baseline entries, so a ratchet that should only shrink can silently grow. Until that is fixed, every other baseline number below is unreliable as a measure.

Once #2124 lands:

- **#1892** — 173 clones, 1853 duplicated lines, against a baseline of 178/1902. This one is already moving in the right direction. Keep it moving.
- **#1877** — the IVR runtime duplication. The largest named cluster.
- **#1931** — the test echo-shape ratchet. This one matters beyond tidiness: 897 baselined `vi.mock` factories do not spread `importOriginal`, so when a mocked module gains an export, every test importing it fails with a catch-all error. That is a live hazard, not a smell.
- **#2104** — `check:effects` skips every `React.useEffect(` call as a "hook definition", so an effect can opt out of the gate, the baseline, and the inventory entirely. A guard that can be disabled by the thing it guards is not a guard.
- **#2129** — the inbound-queue duplicate-offer guard is wired as "already in the baseline" but exists in no baseline, and both database lineages behave wrongly.

The 812 frozen `shadcn/no-restyle` entries in `lint-ratchet.json` are a design-system backlog, not a security item. Schedule them separately. They do not belong in this sequence.

## Step 6 — Work the remaining `Fix now` queue

111 items sit in `Fix now`. Pick by blast radius, not by list order. The unattended ones with the widest reach:

- **#2172** and **#2188** — SMS pacing. #2188 bounds preparation concurrency to half the query pool; #2172 paces provider requests rather than dispatches. Both are load-sensitive and both already have fixes.
- **#2087** — the IVR runtime ignores the persisted `startPageId` and `pageOrder`. The start page and the linear hop are decided by jsonb key order, so a saved script runs in a different order than the operator built. For a product whose core job is playing a script, this is a correctness bug in the core job.
- **#2105** — `env.VERIFICATION_PHONE_NUMBER` throws instead of returning undefined, so the route's 503 branch is unreachable and a missing var boots green.
- **#2139** — member-level role management is server-permitted but UI-invisible, so the `Member` floor on `updateUser`/`deleteUser` is dead code.
- **#2123** — the nested `RouteErrorBoundary` discards the server's explanation for non-404 errors, so users get a generic message where a specific one was available.
- **#2081**'s siblings in the dead-letter family, and the `#2160`-range webhook and campaign issues visible on the board.

---

# Now filed — the four gaps, tracked

These four had no issue on the board. They are filed. #2215 and #2216 are `Bug`; #2217 and #2218 are `Feature`.

| # | Gap | Type | Lane |
|---|---|---|---|
| **#2215** | 11 tenant-scoped tables have no `workspace` foreign key | Bug | Fix now |
| **#2216** | Email verification half-wired: route and prompt exist, no email is ever sent | Bug | Fix now |
| **#2219** | `accept-invite` `actionType=updateUser` creates an account for any email, no token, no limit | Bug | Fix now |
| **#2220** | HTML signup and password-reset forms have no rate limit; their JSON twins do | Bug | Fix now |
| **#2217** | No product analytics anywhere | Feature | Needs decision |
| **#2218** | No recurring revenue: no plan, subscription, or invoice table | Feature | Needs decision |

All six are enriched with root cause, resolution, `lookIn`, and kill-check tests, and the board validator passed on each.

**#2219 is the most serious finding in the whole evaluation.** It is an authentication bypass, not an abuse-rate gap: `signUpAndClaimAction` registers any address with no invite token and no rate limit, and the only gate is `isSignupOpen()`, which `.env.example:66` ships as `true`. The one-line rate limit is the fastest mitigation and should not wait on the token work.

**#2215 is the only one ready to start today.** Eight of the eleven tables are `uuid` on both sides and need nothing but an `ALTER TABLE`. The other three are blocked by a type drift: the database declares `workspace.id` as `uuid` (`drizzle/0000_baseline.sql:5320`) while the Drizzle model declares it `text()` (`app/db/schema.ts:102`), and a `text` column cannot reference a `uuid` one. So `workspace_member`, `workspace_audit_event`, and `workspace_audio` are stuck until that is resolved. This is the same model-versus-database disagreement as #2213, on a different type, and #2213's `information_schema` guard should cover foreign keys too.

Note this refines the first report, which attributed the gap to a `text`/`uuid` mismatch between `workspace_member` and `workspace`. Both columns are `text` in the Drizzle model. The drift is between the model and the database, not between the two models.

**#2216 and #2218 are decisions before they are engineering tasks.** Both bodies list the questions. #2218 is additionally blocked by #1521 (whether refunds reverse credits), and by the open ledger defects in Step 4 — a subscription makes ledger errors more expensive, so those should land first.

**#2217 is the largest gap and the least defined.** The body argues for a first-party event table over a vendor, but the sink choice is genuinely open and should be made deliberately.

---

# What to leave alone

State this plainly, because everything above reads as one-directional.

- **The tenant client.** `createTenantDb` merges the tenancy predicate into every read, update, and delete and injects it on every insert (`app/server/tenant-db.ts:98-130`). It strips the tenancy column from update payloads at runtime (`:66-74`), so a loosely typed caller cannot reassign a row. ESLint bans the global DB client from `app/routes/**` (`eslint.config.mjs:194-234`).
- **The billing RPC.** One idempotent plpgsql function, one shared rate card, one shared idempotency-key builder, and a reconciliation path that uses the same terminal-status set as the debit gate (`shared/pricing.ts:84-99`). A sign flip would silently add credits. This design prevents it. #2101, #2120, #2112, #2150, and #2084 are bugs in the callers and the schema, not in the mechanism.
- **The dispatch pacing.** The semaphore is held only across database work, not across the pacing wait (`app/lib/campaign-sms-dispatch.server.ts:631-632`). Send-window deferral targets the exact next open instant (`app/lib/worker/handlers/campaign.server.ts:459-470`). A schedule watchdog reseeds missing job chains. This is production telephony done properly.
- **The auth fundamentals.** scrypt hashing, 7-day sessions with revocation on reset, sha256 API keys in constant-time compare, scope ceilings that stop a key exceeding its creator's role, and a uniform 404 for non-members so workspace ids cannot be enumerated.
- **The test suite.** Sampled tests assert real boundary values against a fixed clock, not mocked echoes. `e2e/specs/errors-empty-states.spec.ts` treats empty and error states as first-class.
- **The compliance framework itself.** A2P scoped to `US`/`BOTH`, toll-free verification as the Canadian path, emergency-address validation before a voice number is rentable, one predicate table shared by the UI and the send gate so they cannot diverge. The design is right. #2081, #2082, #2083, and #2143 are wiring defects inside it.

---

# Sequencing

| Step | Issues | Parallel? | Gate before merge |
|---|---|---|---|
| 0 | **#2219**, then **#2220**, **#2216** | No — auth path, small and serial | `ci:local` + the 429/bypass kill-checks |
| 1 | #2208, then #2154 | No — hot path, own PR | `npm run ci:local` |
| 2 | #2081, #2082, #2083 | Yes, after #2208 | `ci:local` + the dead-letter kill-check |
| 3 | #2135, #2099, #2098, #2078, #2137, #2141 | Yes, six-way | `ci:local` + `check:route-authz` |
| 4 | #2213 guard, then #2101, #2120, #2112, #2084, #2150, #2102 | Serial within billing | `ci:local` + `db:ledger:check` + `db:enums:check` |
| 5 | #2124 first, then #1892, #1877, #1931, #2104, #2129 | Yes, after #2124 | `ci:local` + the guard's own baseline |
| 6 | **#2215** (8 unconstrained tables) | Yes | `ci:local` + a real-Postgres FK test |
| 7 | The remaining `Fix now` queue | Yes | `ci:local` |

Step 0 is new and sits above the data-corruption work on purpose. #2219 hands an unauthenticated caller an authenticated session for an identity they choose, and the register rate limit it skips is the only bound on provisioning cost. #2216 compounds it: with email verification half-wired, a registered address is never proven, so whoever registers an address first controls the account when a password reset arrives. #2220 is the same class of wiring gap and is one line per file.

Rules that apply to every step, from `AGENTS.md`:

- Full `npm run ci:local` green before every push. A partial gate surfaces as a red PR, and a red push blocks Railway deploys.
- Every PR into `dev` needs `Closes #N` or the `no-issue` label. The label is what the workflow reads; the word in the body does nothing.
- One logical concern per PR. Do not bundle.
- Reference context-only issues in the body prose, never in an `Issues:` line, or the CHS project status moves wrongly.

---

# Evidence base

Re-verified every claim above against source at `dev@d0c96b79`. Specifically re-checked, and the first report was wrong on both: `app/lib/twilio-readiness.server.ts:34-88` (the gate exists), `app/lib/campaign-sms-send.server.ts:100` and `app/lib/chat-sms.server.ts:82` (both call it), and `a2pApplies` in `app/lib/messaging-onboarding/predicates.ts` (scopes A2P to `US`/`BOTH`).

Issue data comes from `ISSUE_BOARD.md` (283 issues) and `scripts/issue-board-enrichment/`. I read the board's issue titles and full entries. I did not run `gh issue view` against GitHub, so an issue may have moved since the board was generated. Confirm with `npm run tools:issues:board` before claiming a number.

Not verified: I did not boot the app, did not run the test suites, did not query any database, and made no claim about actual usage. Documentation in `docs/` was not used as evidence for any finding.

# Follow-up review of the proposed fixes

`thermo-review-of-proposed-fixes.md` audits the *shape* of the remediation proposed in the six issues, not the findings. It found two blockers in the proposed fixes themselves, and all three issues were amended as a result:

- **#2219** originally proposed adding a rate limit and then requiring an invite token. That is a guard, and it leaves the defect in place, because the defect is the raw `actionType` dispatch at `app/routes/accept-invite.action.server.ts:225-234`, where each branch hand-parses and hand-validates itself. The amended resolution uses a `z.discriminatedUnion` so an unvalidated path is unrepresentable rather than merely unchecked, parsed by `parseActionBody` — which the codebase already exports and **zero routes currently use**.
- **#2220** originally named two call sites. It now also requires a `check-handlers` guard, because nothing enforces which limiter a route uses and the existing split is not along a clean axis. Two more one-line call sites would leave the trap in place for the next auth action someone adds by copying a neighbour.
- **#2216** now states the cost of Option A as far as the code allows. The finding is that the cost is unmeasurable: there is no product analytics, so #2217's absence is now a live dependency of a security decision rather than a general improvement.

Reading the review matters for the same reason reading the `Corrections` section of the report matters: it records where the analysis was wrong, including where it was wrong about its own fix. A reviewer who approves the findings without auditing the shape of the suggested remediation has approved half the work.

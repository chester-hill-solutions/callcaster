# Code Review: Improvement Report

A cold read of the CallCaster codebase. Code is the only evidence. Documentation was not used as a source.

Verdict up front: the engineering is strong. The product is narrower than the code, and four specific defects would cost a real customer money or trust. Fix those first.

## Scores

| Axis | Score | One line |
|---|---|---|
| Idea | 7/10 | Real, expensive problem. Revealed buyer is narrow: Canadian political campaigns. |
| Execution | 8/10 | Core flow works end to end. States, security, and ops are handled. |
| Adoption potential | emerging | A stranger can complete the core job. Revenue, analytics, and signup are unfinished. |

## What this product is

A multi-tenant outbound voice and messaging platform over Twilio. A workspace buys credits, gets a Twilio subaccount and a Stripe customer, then runs SMS campaigns, IVR robocalls, and a browser softphone.

The contact schema names the buyer: `voter_list_source` holds `elections_canada` and `elections_ontario` (`app/db/schema.ts:89`), and `contact` carries `voter_id` and `support_level` (`app/db/schema.ts:285-290`).

The code is good. The product decisions around it are where the risk sits.

---

# Priority 1 — Fix before selling to anyone new

## 1.1 A workspace-level compliance failure dead-letters the whole audience

> **Correction.** This section originally claimed no send path reads A2P status. That was wrong, and it was wrong twice over. `assertWorkspaceCanSendSms` is the first statement of every SMS send (`app/lib/campaign-sms-send.server.ts:100`) and chat sends call it too (`app/lib/chat-sms.server.ts:82`). It fails closed on `a2p_approved`, sender-pool drift, and toll-free verification (`app/lib/twilio-readiness.server.ts:66-88`). Separately, the A2P predicate passes unless `operatingCountry` is `US` or `BOTH`, so Canadian workspaces are routed through toll-free verification and the US regime was never the right frame. The corrected finding is below. Tracked as #2081, #2082, #2083.

The real defect is what happens when that gate throws.

`WorkspaceSmsNotReadyError` is a workspace-scoped condition: A2P not approved, sender pool out of sync, toll-free unverified, no Messaging Service. Every contact is blocked identically. Nothing in the dispatch loop catches that class, so it is absorbed as a **per-member** failure, which increments `attempt_count` on that contact's queue row (`app/lib/campaign-sms-dispatch.server.ts:283-288,563-569`). The same tick then runs the dead-letter sweep against `max_attempts = 5`.

Five dispatch ticks of a non-ready workspace flip the **entire audience** to `failed`, with a customer-facing reason of "Max queue attempts exceeded". Nothing was sent. Nothing was wrong with any contact.

The trigger is realistic: a number detached at Twilio makes `sender_pool_in_sync` fail mid-campaign, and a campaign launched before A2P clears hits the same gate.

Fix: hoist `assertWorkspaceCanSendSms` to the top of the dispatch tick and abort before any per-member work. Add an `instanceof WorkspaceSmsNotReadyError` branch in the rejection handler as defence in depth. Report the blocker once, on the campaign, not per contact. Keep the genuine per-contact failure path unchanged.

## 1.2 `accept-invite` creates an account for any email, with no invite token

> Found on a second pass, after #2219. This is the most serious auth finding in the set and it outranks everything else in Priority 1.

The action dispatches on a form field (app/routes/accept-invite.action.server.ts:225-234). Two of three branches validate an invite token. The third does not:

```ts
if (actionType === "redeemInvitation") return redeemInvitationAction(ctx);  // validates a token
if (actionType === "updateUser")        return signUpAndClaimAction(ctx);   // validates nothing
```

`signUpAndClaimAction` reads `email`, `password`, `firstName`, `lastName` from the form body and calls `auth.api.signUpEmail` (`:142-149`). The `invitationId`/`token` pair is optional and only claims an invite *after* the account already exists (`:163-187`); without it, the function returns every pending invitation for that address (`:189-194`).

The only gate is `isSignupOpen()`, and `.env.example:66` ships `SIGNUP_OPEN=true`. The `auth` strategy is a bare `getSession` (`:215`) — no session required, no rate limit.

Consequence: an unauthenticated caller registers any address, gets a live session, and reads that address's pending workspace invitations. Every account can also provision a Twilio subaccount and spend credits. The two gates that would normally bound this — the per-IP limiter and the signup flag — are exactly the two this branch skips or defaults open.

Fix: apply the register rate limit first (one line), then require a valid unredeemed invitation via the existing `redeemWorkspaceInvitation` (`:46-58`), and stop returning the invite list to an unauthenticated caller.

## 1.3 The HTML signup and password-reset forms have no rate limit

The JSON twins are limited. The browser forms are not.

| Route | Rate limited | Evidence |
|---|---|---|
| `POST /api/auth/register` | Yes, 10/60s | `app/routes/api+/auth/register.action.server.ts:10` |
| HTML signup form | **No** | `app/routes/signup.action.server.ts` — no `enforceAuthRateLimit` |
| `POST /api/auth/reset-password` | Yes, 10/60s | `app/routes/api+/auth/reset-password.action.server.ts:10` |
| HTML reset form | **No** | `app/routes/reset-password.action.server.ts` — no `enforceAuthRateLimit` |
| HTML signin form | Yes | `app/routes/signin.action.server.ts:14` — `enforceAuthRateLimit` |
| HTML two-factor form | Yes | `app/routes/two-factor.action.server.ts:14` |
| HTML forgot-password form | Yes | `app/routes/remember.action.server.ts` |

The limiter is not missing from the codebase; three of five HTML auth actions use the in-handler form. These two do not, and they reach the same two operations as the limited JSON twins. This is a wiring gap.

Consequence: unbounded registration cost, since every account can provision a Twilio subaccount and spend credits. The reset gap is lower severity — that form requires a valid token, so the exposure is an unthrottled token-verification endpoint, not a session-revocation path.

Fix: add `enforceAuthRateLimit` to both actions, matching signin. Two one-line changes. Tracked as #2220.

## 1.4 No account lockout on password sign-in

A per-IP limit of 10 per 60 seconds (`app/routes/signin.action.server.ts:14-20`) does not stop a distributed credential-stuffing run. A grep for `lockout`, `failedAttempt`, and `brute` across `app/` returns nothing.

The only lockout in the system is Better Auth's TOTP plugin default: 10 failures per 900 seconds, backed by `auth_two_factor.locked_until` (`app/db/auth-schema.ts:81-82`). That covers 2FA only, and 2FA is off unless `TWO_FACTOR_ENABLED` is set (`app/lib/env.server.ts:270-273`).

Fix: add a per-account failed-password counter, and lock the account after a threshold. The `auth_two_factor` columns are a working precedent.

## 1.5 Signup is closed by default

`isSignupOpen()` returns true only when `SIGNUP_OPEN` is exactly `true` or `1` (`app/lib/env.server.ts:288-292`). `.env.example:66` ships `SIGNUP_OPEN=true`, so a self-hosted deploy starts **open**, and the review environment's `.env` sets it too. Any deploy that omits the variable is closed, and the signup page becomes a request-access contact form (`app/routes/signup.tsx:154-206`).

This cuts both ways, and both directions are worth stating. The gate is real and deliberate. But the shipped default is open, which is why #2219 is exploitable: the one control standing between an anonymous caller and a real account is an environment variable that this repo's own example file sets to `true`.

Fix: decide the intended default deliberately rather than by omission, and log a startup line stating the effective value so an operator can see which side of the gate a deployment is on.

---

# Priority 2 — Reduce risk and cost

## 2.1 Eleven tenant-scoped tables have no database foreign key

The Drizzle schema declares zero `.references()` for tenancy columns (`app/db/schema.ts`, confirmed by grep). The SQL layer is better: the baseline adds 16 workspace foreign keys, all with `ON DELETE CASCADE`.

Sixteen of twenty-seven tenant-scoped tables are covered. These eleven are not:

`campaign_queue`, `outreach_attempt`, `workspace_events`, `workspace_audit_event`, `workspace_audio`, `workspace_member`, `agent_status`, `agent_status_event`, `inbound_queue`, `inbound_queue_member`, `inbound_queue_entry`

The gap splits in two. **Eight of the eleven need nothing but an `ALTER TABLE`.** `campaign_queue`, `outreach_attempt`, `workspace_events`, `agent_status`, `agent_status_event`, `inbound_queue`, `inbound_queue_member`, and `inbound_queue_entry` are `uuid` on both sides and simply never got the constraint.

**Three are blocked by a model-versus-database drift.** The database declares `workspace.id` as `uuid DEFAULT gen_random_uuid() NOT NULL` (`drizzle/0000_baseline.sql:5320`) while the Drizzle model declares it `text()` (`app/db/schema.ts:102`). A foreign key needs matching types, so the `text` columns `workspace_member.workspace_id` (`:126`), `workspace_audit_event.workspace_id` (`:453`), and `workspace_audio.workspace_id` (`:472`) cannot reference it as written. The authorization table is among the three.

Consequence: a delete on `workspace` silently leaves orphans in eleven tables. There is a check for this (`db:orphans:check`), which is the right mitigation, but a check that runs in CI is not a constraint that runs on every write.

Note the split in the code. `campaign_queue` and the ACD tables are the ones with the most sensitive data and no constraint. `workspace_member` is the authorization table and cannot be constrained at all in its current shape.

Fix: add the eight unblocked constraints now; do not wait on the other three. Then correct the Drizzle model for `workspace.id` to match the database's `uuid` — but verify against real data first, because the `text` model has stood since the baseline, so confirm every production workspace id parses as a `uuid` before narrowing the type. Tracked as #2215.

## 2.2 Two hundred and thirty lines of baseline debt are frozen, not shrinking

Three ratchet baselines hold known problems in place:

| Baseline | Entries | Meaning |
|---|---|---|
| `scripts/baselines/test-mock-replace.txt` | 897 | `vi.mock` factories that do not spread `importOriginal` |
| `scripts/baselines/unscoped-db-imports.txt` | 84 | `app/lib` modules importing the global unscoped DB client |
| `scripts/baselines/lint-ratchet.json` | 812 `shadcn/no-restyle` | Design-system violations |

Each guard fails only on growth. That is the right design, and it stops the bleeding. It does not shrink the debt. The 897 mock factories are a live hazard: when a mocked module gains an export, every test importing it fails with a catch-all error.

Fix: spend a fixed slice of each sprint burning baseline entries. Track the count as a metric with a downward target.

## 2.3 Dead code in the auth surface

- `POST /api/auth/verify-email` calls `auth.api.verifyEmail` (`app/lib/platform-auth.server.ts:339-380`), but nothing ever issues a verification token. A grep for `sendVerificationEmail` and `emailVerification` across `app/` returns nothing. The route is unreachable.
- `registerUser` returns "Registration successful. Verify your email before signing in" (`app/lib/platform-auth.server.ts:189-198`). Better Auth returns a session token when verification is not required, so this branch never runs.
- Four endpoints return HTTP 410 through `retiredEndpoint`: `verify-audio-session`, `verify-pin-input`, `verify-audio-pin/:pin`, and the verify-audio-session loader.

The 410 endpoints are correct. They document a deliberate retirement. The verify-email path is different: it is a feature that was designed, partially removed, and left half-wired.

Fix: either configure email verification in `app/server/auth-instance.ts` and issue tokens, or delete the verify-email route and the unreachable branch. Do not leave a security feature half-present, because a reader will assume it works.

## 2.4 Orphaned tables in the review environment

`workspace_twilio_config`, `workspace_onboarding`, and `workspace_sync_snapshot` appear only in `scripts/schema-transform/07-split-workspace-twilio-data.sql`. No application code references them. They are artifacts of the Railway review environment, not the product.

Fix: move them out of the transform script, or document why they must exist. Right now a reader cannot tell whether they are load-bearing.

---

# Priority 3 — Commercial gaps

These are product decisions, not defects. They cap adoption regardless of code quality.

## 3.1 No recurring revenue exists in code

There is no `plan`, `subscription`, or `invoice` table anywhere in the schema or the migrations. The only pay path is a one-time credit purchase with a $10 minimum (`shared/pricing.ts:9`).

Stripe customer creation happens at workspace provisioning (`app/lib/database/workspace-provisioning.server.ts:138-145`), and a webhook exists (`app/routes/api+/stripe-webhook.action.server.ts`). The plumbing is half there. The recurring product is not built.

Consequence: revenue stops when a customer's credits run out. A campaign platform that must be re-funded manually is a tool, not a subscription.

## 3.2 No product analytics

No PostHog, Segment, Mixpanel, Amplitude, or Google Analytics in `app/`, `shared/`, `services/`, `worker/`, or `server/`. Sentry is wired for errors only, at 8 call sites.

There is no funnel instrumentation, no cohort tracking, and no retention measurement. The only usage-adjacent tables are `workspace_events` (an SSE feed, `app/db/schema.ts:443`) and `workspace_audit_event` (a security log, `app/db/schema.ts:451`). Neither answers a product question.

Consequence: no way to learn which features get used, where signups drop off, or who churns. Every product decision stays a guess.

## 3.3 The free tier is $2 and there is no self-serve trial

New workspaces get 100 welcome credits (`app/lib/database/workspace-provisioning.server.ts:33`). At $0.02 per credit (`shared/pricing.ts:8`) that is $2, or roughly 20 staffed call minutes, or 50 SMS segments.

That is enough to confirm the product works. It is not enough to run a real campaign. And a new user must create a workspace by hand after signup (`app/routes/workspaces+/index.tsx:125-146`); registration does not create one (`app/lib/platform-auth.server.ts:151-209`).

Fix: consider a larger trial and workspace auto-creation at signup. Both are small changes with direct effect on activation.

## 3.4 Identity is email and password only

No OAuth providers are configured (`app/server/auth-instance.ts` has no `socialProviders`). No email verification. No magic link.

Consequence: every user invents a password and remembers it. This is friction at the top of the funnel, and it removes Google and Microsoft sign-in, which most business buyers expect.

## 3.5 The build is far wider than the product

53 tables, 542 route modules, 189 flat route ids. The 90-day commit split is 355 `fix` against 134 `feat`.

The feature list includes inbound ACD queues with agent status and hold audio, an IVR survey builder with six tables, live call transcription, agent coaching with scoring, browser handsets, and RCS-adjacent sender management. The revealed product is a campaign outreach tool.

Consequence: maintenance cost scales with the surface, not the revenue. A campaign customer does not use the ACD queue. The team still maintains it.

Fix: decide what the product is. Cut what will not be sold, or find the second vertical that pays for the rest.

---

# What is working, and should not be disturbed

Stated plainly, because the list above reads as one-directional.

**The test suite tests behavior.** 640 test and spec files, 36 e2e specs. A sample, `test/campaign-dispatch-policy.test.ts`, asserts real boundary values against a fixed UTC clock, not mocked echoes. `e2e/specs/errors-empty-states.spec.ts` covers empty and error states as a first-class concern.

**The typecheck is clean.** `npx tsc --noEmit` returns no output.

**The guards work.** 25 `check:*` scripts, all passing. The file-size guard holds every app file under 800 lines with 5 baseline exceptions. The DRY gate reports 173 clones against a baseline of 178, so it is moving in the right direction. The handler gate confirms every route action goes through the factory and cross-checks 31 declared capabilities against 198 operations.

**Tenancy has a real mechanism.** `createTenantDb` merges the tenancy predicate into every read, update, and delete, and injects it on every insert (`app/server/tenant-db.ts:98-130`). It strips the tenancy column from update payloads at runtime, so a loosely typed caller cannot reassign a row (`:66-74`). ESLint bans the global DB client from all of `app/routes/**` (`eslint.config.mjs:194-234`).

**The dispatch chain is production telephony.** Provider-rate pacing with a semaphore held only across database work (`app/lib/campaign-sms-dispatch.server.ts:631-632`), send-window deferral to the exact next open instant (`app/lib/worker/handlers/campaign.server.ts:459-470`), credit parking that pauses rather than fails, dead-lettering, and a schedule watchdog that reseeds missing job chains (`app/lib/worker/ensure-scheduled-jobs.server.ts:64-92`).

**Billing is disciplined.** Debits go through one plpgsql RPC that is idempotent, with a shared rate card and shared idempotency keys. The reconciliation path and the debit gate use the same terminal-status set (`shared/pricing.ts:84-99`). A sign flip here would silently add credits, and the design prevents it.

**Security fundamentals are right.** scrypt password hashing via Better Auth, 7-day sessions with revocation on password reset (`app/server/auth-instance.ts:30`), sha256-hashed API keys compared in constant time (`app/lib/secure-compare.ts:13-18`), scope ceilings that stop a key from exceeding its creator's role (`app/lib/platform-members.server.ts:117-135`), a 4-role model with a fine-grained capability layer including an owner-only `audit.read` (`app/lib/capabilities.ts:47-78`), and a uniform 404 for non-members so workspace ids cannot be enumerated.

**No secrets are committed.** A scan for Stripe keys, Twilio SIDs, private keys, and literal bearer tokens across all source, config, and SQL files returns only test fixtures and a dev-mode fallback that throws in production (`app/lib/env.server.ts:225-229`).

---

# Corrections

Three claims in this report were wrong on first pass. All three are corrected above. Recording them because each one changed a conclusion.

**1. "One real foreign key."** An earlier pass reported the schema contains one foreign key. Wrong: the grep missed the `ADD CONSTRAINT` form. The Drizzle schema declares zero `.references()`; the SQL baseline adds 55 foreign keys, 16 pointing at `workspace` with `ON DELETE CASCADE`. Section 2.1 now carries the real gap.

**2. "No send path reads A2P status."** Wrong. `assertWorkspaceCanSendSms` gates every SMS send at `app/lib/campaign-sms-send.server.ts:100` and every chat send at `app/lib/chat-sms.server.ts:82`, failing closed on A2P, sender pool, and toll-free verification. The grep that produced the claim searched only `campaign-sms-dispatch.server.ts`, which is the batch dispatcher, not the per-send path. Section 1.1 now reports the real defect, which is worse in a different way: a workspace-level throw is recorded per contact and dead-letters the whole audience.

**3. "A2P is a live compliance risk."** Wrong framing. A2P 10DLC is a US regime, and the code already scopes it: `a2pApplies` in `app/lib/messaging-onboarding/predicates.ts` returns false unless `operatingCountry` is `US` or `BOTH`. Canadian workspaces are gated on toll-free verification instead. The compliance framework is scoped correctly. The real Canadian-path defects are #2083 (the toll-free gate fails open) and #2145 (the toll-free `optInType` is inferred from free-text prose, which is a false regulatory attestation).

One further claim was imprecise rather than wrong. Section 2.1 originally attributed the foreign-key gap to a `text`/`uuid` mismatch *between* `workspace_member.workspace_id` and `workspace.id`. Both are `text` in the Drizzle model. The drift is between the Drizzle model and the database, where `workspace.id` is `uuid`.

**4. "The HTML signup and password-reset forms have no rate limit" — right, but my table was wrong.** The first draft listed `accept-invite` as a third gap and left the impression that `signin` and `two-factor` were also unthrottled. Re-checked: `signin` and `two-factor` both call `enforceAuthRateLimit` (`app/routes/signin.action.server.ts:14`, `app/routes/two-factor.action.server.ts:14`), and so does `remember`. Only `signup` and `reset-password` are genuinely unwired. The subagent that produced that first draft cited line numbers that did not survive verification.

**5. A claim about the reset form that I made and then retracted.** An earlier draft of #2220 asserted the unthrottled reset form let an attacker force session revocation on any known account, because `revokeSessionsOnPasswordReset` is enabled. Wrong: `reset-password.action.server.ts:36` calls `auth.api.resetPassword` with a token from the URL, so revocation only runs on a successful reset and an attacker without the token cannot reach it. The issue body and this section were both corrected. The rate-limit gap is real; the impact I first described was not.

**A note on method.** Four of these five errors came from a grep that searched the wrong scope, or from a subagent citation that was not re-verified. The two that mattered most — the missing A2P gate and the type mismatch — would each have sent a developer to fix something that was not broken, or to skip something that was. Every file:line in this document was re-checked against source before an issue was filed.

---

# Evidence base

Inspected the route tree (189 flat ids), 542 route modules, the 53-table Drizzle schema across 6 schema files, 65 `client/migrations` SQL files, the `drizzle/0000_baseline.sql` constraint set, `shared/pricing.ts`, the campaign dispatch path, the worker job registry, `app/server/tenant-db.ts`, Better Auth configuration, 4 `openapi/*.json` surfaces, 8 CI workflows, and the lint and ratchet baselines.

Executed `npx tsc --noEmit` (clean) and the file-size, DRY, and handler guard scripts (all pass). Did not boot the application, did not run the test suites, and did not query any database, so runtime behavior is unverified and no claim about actual use is made.

Documentation was not used as evidence for any finding. Every claim above cites source, a config file, or a command result.

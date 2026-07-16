# Dev Test Plan — next round (2026-07-16)

Status snapshot when this plan was written:

- `dev` @ `44343677` was audited end-to-end (full compose E2E, all CI gates, ~200-route
  surface map, two manual browser passes across all five seeded roles). Findings live in
  the 2026-07-16 QA session; the durable ones are tracked below as test items.
- **PR #1055** (`audit/deep-surface-2026-07-16`) fixes the audited P0s (dead dial loop via
  queue-RPC drift, contact-form data loss, missing server-side role gates, audience enum,
  survey persistence). Three follow-up fixes are stacked on it: chat-SMS silent failure,
  RouteErrorBoundary raw-error leak + duplicate-campaign `script_id`, E2E MinIO/eslint
  hygiene.
- Everything below assumes those merge first. **Do not sign off any Tier 1 item against a
  tree that predates them.**

Seeded test logins (committed in `scripts/e2e/seed-data.mjs`): `owner|admin|member|caller|
sudo|invitee@e2e.test`, password `E2eTestPass1!`. Workspaces: Ready `…0001`, Onboarding
`…0002`, Empty `…0003`.

---

## Tier 1 — Post-merge regression gate (local compose; blocks everything else)

Run on `dev` after the merges. Environment: `docker compose -f docker-compose.dev.yml up -d
postgres minio inbucket`, then `npm run test:e2e:compose` (Node 22).

| # | Item | How | Pass criteria |
|---|---|---|---|
| 1.1 | Full E2E suite, twice back-to-back | `test:e2e:compose` ×2 without recreating the stack | Both runs green (2nd run proves the MinIO purge fixed ERR-11 cross-run pollution) |
| 1.2 | Contact create/edit | Browser: `/contacts/new` fill+save; edit existing; reload | Values persist; blank-row bug gone; fields editable |
| 1.3 | Queue enqueue paths | Browser: new campaign → add from audience AND search/add single contact | Rows appear in queue; no 500; counts correct |
| 1.4 | Caller RBAC (server-side) | As `caller@`: direct-nav `/billing`, `/campaigns/new`, existing campaign `/settings`, POST replay | 403/redirect from the SERVER, not just hidden UI |
| 1.5 | Audience create | `/audiences/new` → Create Empty Audience | Audience created; no raw SQL on failure paths |
| 1.6 | Public survey round-trip | Build survey → open public link anon → submit → responses page | Response recorded and visible; export contains it |
| 1.7 | Chat SMS failure surfacing | Send SMS in a thread with Twilio unreachable (local) | Error toast, input NOT cleared, no phantom `ok:true` |
| 1.8 | Duplicate campaign | Campaign settings → duplicate | Copy created with source's script; failure (if any) shows friendly message, never SQL |
| 1.9 | Queue status actions | Queue row: "dequeued" action | Status does NOT write `COMPLETED`; user gets feedback |

## Tier 2 — Local-closable gaps (never driven; all runnable on the compose stack)

| # | Item | How | Pass criteria |
|---|---|---|---|
| 2.1 | Invite acceptance end-to-end | Owner invites fresh email → open invite link (Inbucket at the compose stack's mapped port) → accept as invitee → probe role access | Membership row + correct role gates applied |
| 2.2 | Email delivery (local) | Check Inbucket for: invite, password reset, voicemail-to-email, contact form | Mail arrives, links work, no broken templates |
| 2.3 | Password reset loop | `/remember` → Inbucket link → `/reset-password` → sign in with new password | Works; old password rejected; generic success copy (no token oracle) |
| 2.4 | 2FA enrollment + TOTP login | Run E2E server WITHOUT `DISABLE_2FA_ENFORCEMENT`; enroll at `/account/security`, sign out, log in with TOTP | Enrollment UI actually renders (QA saw none — may be env-hidden, must confirm); login loop works; sudo forced to enroll |
| 2.5 | Signup end-to-end | `SIGNUP_OPEN=1`: signup → verify email (Inbucket) → land in `/workspaces` → create workspace | Full loop works; closed-signup 403 still enforced when flag off |
| 2.6 | Onboarding wizard step-through | Owner on Onboarding workspace `…0002`: submit EVERY step incl. skip paths, then member read-only re-check | Each step persists; review/launch state coherent |
| 2.7 | Workspace danger zone | Transfer ownership + delete workspace | **Known gap: no UI exists** though server actions do — decide build-or-remove, then test |
| 2.8 | Export content correctness | Campaign + survey CSV exports: open the files | Rows/columns match seeded data, not just "download worked" |
| 2.9 | Admin write actions | As sudo: edit user, toggle workspace status, manage memberships, dead-letters view | Actions persist; no raw errors |
| 2.10 | API contract sweep | Scripted pass of the API-key data-plane routes (`docs/api-data-plane.md`) with the seeded key vs `/api/docs/openapi` | Responses match spec shapes; authz classes enforced per `docs/api-auth-matrix.md` |
| 2.11 | Profile edit | `/account` save first/last name | Persists (QA saw silent 400 — verify fixed or file it) |
| 2.12 | UX feedback batch | Landing contact form, duplicate-invite warning, voicemail recipient dropdown after save | Every submit gives visible success/failure feedback |

## Tier 3 — Requires the deployed dev/staging environment (real providers)

Precondition (currently BLOCKING, seen on PR #1055's review deploy): the environment must
boot — provision a mode-correct Stripe key for its `NODE_ENV`, and apply
`client/migrations/` (the boot guard aborts if `apply_ledger_entry_and_sync_credits` is
missing). Fix the env provisioning once; it fails every PR until then.

| # | Item | Pass criteria |
|---|---|---|
| 3.1 | Stripe purchase → ledger | Real (test-mode) checkout → `/confirm-payment` → credits incremented, transaction row, webhook processed. THE top staging test |
| 3.2 | Real outbound call | Live-call campaign: dial through browser device; disposition saves; call row + billing debit correct |
| 3.3 | Predictive/power dial + ACD | Two agents, small queue: distribution, claim, no double-dial (exercises the repaired claim/auto_dial RPCs under real timing) |
| 3.4 | Real SMS round-trip | Outbound from chat + campaign; inbound reply hits SIGNED `/api/inbound-sms` and threads correctly; scheduled send fires in window |
| 3.5 | Number purchase + inbound routing | Buy number, configure routing/queue/voicemail, place inbound call, voicemail records + email arrives |
| 3.6 | Caller-ID verification | Full callback loop |
| 3.7 | Admin Twilio portal writes | Sync, webhook audit/repair, billing reconciliation on a sandbox workspace; also watch the portal's deferred loader under real Twilio latency (banned `<Await>` pattern — see repo rule) |
| 3.8 | Webhook signature enforcement | Unsigned POSTs to `/api/inbound-sms`, `/api/call-status`, etc. are REJECTED in deployed env (local E2E accepts unsigned by design); check the known-weak set: `/api/dial/:number`, `/api/twilio/a2p/events`, `/api/verify-*` |
| 3.9 | Worker + cron | Worker container runs; each `/api/jobs/*` route fired with `x-cron-secret`: low-credit notify, number-rental billing, billing reconcile, twilio-open-sync; dead-letter path on induced failure |
| 3.10 | SSE under real network | Workspace events stream survives >5 min, reconnects after drop (local QA saw one `ERR_INCOMPLETE_CHUNKED_ENCODING`) |

## Tier 4 — Breadth (schedule after Tiers 1–3 are green)

- Multi-user concurrency: two sessions dialing one campaign; simultaneous queue edits.
- Browser matrix: Safari + Firefox smoke of dialer, audio recorder, chat.
- Accessibility audit (screen-reader pass on dialer + settings; PR #1055's a11y batch
  verified in-browser).
- Scale: 10k-contact CSV import, paginated lists, big export.
- Design-system debt burn-down: ~105 hardcoded palette colors across 45 files, `admin+/`
  PageShell adoption, hand-rolled status indicators (`NumbersTable`), native `alert()` in
  the mic-permission hook.

## Automated coverage to add (so the above stays tested)

Priority order, from the 2026-07-16 coverage-gap analysis:

1. Signup → verify → workspace-create spec (E2E).
2. Invite → accept → RBAC-applied spec (E2E).
3. 2FA enable → TOTP login spec (E2E, enforcement on).
4. `/confirm-payment` credit-write spec (mock Stripe session retrieve).
5. Team-management writes + numbers/queues write flows (E2E).
6. Onboarding wizard step-through (E2E).
7. Contract tests generated from the OpenAPI spec for the data-plane routes.
8. Marketing pages + contact-form smoke.

## Standing environment rules (so results are trustworthy)

- Node 22 for every local run (`~/.nvm/versions/node/v22.23.1`); other versions produce
  phantom test failures.
- Never trust a single compose-E2E run after storage-touching specs until 1.1's
  double-run is standard.
- `db:ledger:check` needs `DATABASE_URL` and a migration-tracked DB; against the compose
  DB it fails by construction (bootstrap bypasses the ledger) — don't chase it as a bug.
- The E2E server sets `E2E_TEST=1` + 2FA-enforcement bypass: RBAC/2FA conclusions from
  that env understate production strictness — confirm auth-hardening items with
  enforcement on (2.4) or in the deployed env.

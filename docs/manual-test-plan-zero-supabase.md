# Manual Test Plan — Zero Supabase Migration (G3 Gate)

**Branch:** `feat/supabase-postgres-migration`
**Railway target:** `visual-asset-review` — [dashboard](https://railway.com/project/32b36c6c-5f3d-463b-8c7f-bbcd70351e8f?environmentId=18ef9173-4b33-4a62-9b94-9dfc7a36eb05)
**Exit criterion:** `rg -i supabase --glob '!docs/**' --glob '!archive/**'` → 0 matches
**Companion docs:** [`migration-delivery-board.md`](./migration-delivery-board.md) · [`testing-map.md`](./testing-map.md)

## Test environment setup

1. **URL**: `https://callcaster-review.up.railway.app` (or latest Railway review deploy URL)
2. **Local** (optional): `docker-compose.dev.yml` up, `bun dev`
3. **Twilio tunnel** (for webhooks): Localtunnel/ngrok pointing to Railway review or local
4. **Stripe test mode**: verify webhook endpoint points to review URL
5. **Railway DB** (`PostgreSQL 18`): confirm schema from `drizzle/0000_baseline.sql` applied

---

## Smoke tests (must pass before detailed testing)

| Step | Action | Expected | Status |
|------|--------|----------|:------:|
| S1 | `curl -s https://callcaster-review.up.railway.app/api/health` or root loader | 200, no 500 | |
| S2 | Check Railway deploy logs | No `SUPABASE_URL` or `@supabase/*` in startup | |
| S3 | Open browser DevTools → Network | No requests to `*.supabase.co` | |
| S4 | `rg -i supabase --glob '!docs/**' --glob '!archive/**'` in repo | 0 matches | |

---

## A — Auth & session (Better Auth)

Prerequisite: `app/server/auth-instance.ts` + `app/db/auth-schema.ts` configured.

| # | Step | Expected | Status |
|---|------|----------|:------:|
| A1 | Sign up with email + password | Account created; redirected to workspace create | |
| A2 | Sign out, sign in with same credentials | Session cookie set; dashboard loads | |
| A3 | Open `/signin` while already logged in | Redirect to dashboard (no double auth) | |
| A4 | Reset password flow (click "Forgot password") | Email sent; token URL works; password updates | |
| A5 | Accept workspace invite link (Better Auth magic link) | User added to workspace with correct role | |
| A6 | Open `/workspaces/$id` with invalid/expired session | 401 / redirect to signin (not 500) | |
| A7 | Open `/workspaces/$id` while member of different workspace | 404 (not 403 — no workspace-id leak) | |
| A8 | Check session cookie name | `better-auth.session_token` (not `sb-*`) | |
| A9 | **Parallel session test**: log in on 2 browsers, invalidate one | Other session still valid (or per Better Auth policy) | |
| A10 | **Old Supabase session cookie** present on browser | Rejected / ignored (no backdoor) | |

---

## B — Workspace & onboarding

| # | Step | Expected | Status |
|---|------|----------|:------:|
| B1 | Create new workspace from onboarding | Workspace row created; user is owner | |
| B2 | Invite user by email to workspace | Invite row created; email sent (Inbucket/Prod) | |
| B3 | Invite same email twice | Idempotent — no duplicate invite rows | |
| B4 | Update workspace settings (name, timezone, etc.) | Persisted; reflected immediately | |
| B5 | Upload workspace logo/avatar | S3 URL returned; image renders | |
| B6 | Switch between multiple workspaces | UI updates; correct workspace context loaded | |
| B7 | Delete workspace (owner only) | Soft delete or cascade; member access revoked | |

---

## C — Contacts & audiences

| # | Step | Expected | Status |
|---|------|----------|:------:|
| C1 | Create audience manually | Audience row in DB; UI list updates | |
| C2 | Upload CSV with headers `firstname,surname,phone,email` | Contacts created; audience linked; upload history shown | |
| C3 | Upload CSV with `fullname` (vestigial header) | Mapped to `firstname`/`surname` or rejected cleanly | |
| C4 | Upload CSV > 1000 rows | Async processing via Bun worker; progress shown | |
| C5 | View contact detail page | `household_key` visible if set; no `address_id` fields | |
| C6 | Export audience to CSV | Headers match `csv-export-contract.md`; no injection | |
| C7 | Search contacts by phone | Returns correct contact; no cross-workspace leakage | |
| C8 | Merge duplicate contacts (same phone) | Single contact retained; history merged or preserved | |

---

## D — Campaign lifecycle

| # | Step | Expected | Status |
|---|------|----------|:------:|
| D1 | Create new campaign (type = `outreach`) | Unified `campaign` row; no `live_campaign`/`ivr_campaign` | |
| D2 | Create campaign (type = `ivr`) | Same table; `script` / `questions` columns populated | |
| D3 | Edit campaign settings | Update persisted; `updated_at` timestamp | |
| D4 | Assign audience to campaign | Queue rows created in `campaign_queue`; correct count | |
| D5 | Remove audience from campaign | Queue rows for that audience removed (not orphaned) | |
| D6 | Campaign status transitions (`draft` → `running` → `paused` → `complete`) | State machine enforced; no invalid transitions | |
| D7 | Delete campaign | Soft delete or cascade; queue + call/message data handled | |
| D8 | Export campaign results | CSV includes `twilio_sid`, disposition, duration; headers deterministic | |

---

## E — Predictive dial / queue (outbound calls)

| # | Step | Expected | Status |
|---|------|----------|:------:|
| E1 | Start predictive dial campaign | Queue dequeued; agent offered call | |
| E2 | Agent accepts call from queue | WebRTC or phone bridge connects; `outreach_attempt` created | |
| E3 | Agent declines / no-answer | Requeued or marked `failed`; `dequeued_at` set | |
| E4 | Call completes (agent hangs up) | `call` row terminal status; billing ledger entry created | |
| E5 | Twilio status callback fires (`completed`/`no-answer`/`busy`) | `provider_status` updated; no duplicate billing | |
| E6 | Check `campaign_queue` — no `status` column | Only `queue_state`, `assigned_to_user_id`, `provider_status` | |
| E7 | Pause campaign mid-dial | Active calls complete; new dials stop | |
| E8 | Resume campaign | Queue continues from last position | |

---

## F — Messaging (SMS)

| # | Step | Expected | Status |
|---|------|----------|:------:|
| F1 | Send outbound SMS from campaign | Message queued; Twilio SID returned | |
| F2 | Receive inbound SMS to workspace number | Routed to correct campaign/conversation; `sms_status` webhook updates | |
| F3 | Send MMS with media attachment | S3 URL in message; media renders in UI | |
| F4 | Conversation thread view | Messages ordered by `created_at`; no missing messages | |
| F5 | Twilio `sms_status` webhook (`delivered`/`failed`/`undelivered`) | `message.status` updated; billing by `num_segments` | |
| F6 | Duplicate webhook delivery (same `MessageSid` + status) | Idempotent — no duplicate billing ledger entry | |
| F7 | Opt-out keyword (`STOP`) | Contact `sms_consent` revoked; auto-reply sent | |

---

## G — IVR / inbound routing

| # | Step | Expected | Status |
|---|------|----------|:------:|
| G1 | Inbound call to workspace IVR number | `acd-router` logic runs; routed to campaign or agent | |
| G2 | IVR menu selection | Correct `campaign` identified; recording starts | |
| G3 | IVR recording complete | Recording URL stored (S3); `ivr-recording` webhook processes | |
| G4 | IVR flow webhook (`ivr-flow`) | TwiML returned; no Edge Function invoked | |
| G5 | IVR status webhook (`ivr-status`) | `call` row updated; conference/queue state correct | |
| G6 | `TWILIO_IVR_RUNTIME` env check | Remix routes used (not Edge fallback) | |

---

## H — Billing & credits

| # | Step | Expected | Status |
|---|------|----------|:------:|
| H1 | View workspace credits | Balance accurate; matches `transaction_history` sum | |
| H2 | Outbound call billing | `debitAmountFromCredits()` used; negative amount not hand-rolled | |
| H3 | SMS billing by segments | `num_segments` cast from string; correct total | |
| H4 | Number rental billing | `number_rental_purchase` + `number_rental_cycle` ledger entries | |
| H5 | Stripe top-up | Checkout session → `stripeSessionKey` idempotency; credits incremented | |
| H6 | Stripe webhook (`checkout.session.completed`) | Idempotent via `stripeEventKey`; no double credit | |
| H7 | Run `npm run db:ledger:check` | 34/34 migrations match; no drift | |

---

## I — Media / storage (S3 / Railway Buckets)

| # | Step | Expected | Status |
|---|------|----------|:------:|
| I1 | Upload campaign audio (MP3/WAV) | Normalized to MP3 via `ffmpeg`; S3 URL in `campaign.audio_url` | |
| I2 | Play uploaded audio in preview | Streams from S3 (not `*.supabase.co/storage/…`) | |
| I3 | Upload workspace media (logo, avatar) | S3 URL; renders in UI and emails | |
| I4 | Export campaign with media attachments | CSV contains S3 URLs (not Supabase paths) | |
| I5 | Check `workspace-media.server.ts` | No `supabase.storage.from()` calls | |
| I6 | Check `app/lib/env.server.ts` | `S3_*` keys present; no `SUPABASE_*` keys | |

---

## J — Realtime / SSE (replaces Supabase Realtime)

| # | Step | Expected | Status |
|---|------|----------|:------:|
| J1 | Open call room (`useCallRoom`) | SSE connection established to `/api/workspaces/$id/events` | |
| J2 | Another agent joins same room | Presence event received; UI updates | |
| J3 | Agent status change (`available` → `on_call`) | SSE broadcast; supervisor dashboard updates | |
| J4 | Chat message in conversation | SSE delivers to open conversation tabs | |
| J5 | Campaign queue update | SSE pushes new queue count to dashboard | |
| J6 | Check DevTools → Network → WS/SSE | Only `text/event-stream` (no `wss://*.supabase.co/realtime`) | |
| J7 | Check hook filenames | `useWorkspaceEventSubscription.ts`, `useCallRoom.ts` (no Supabase in name) | |

---

## K — Job worker (replaces pg_cron → Edge)

| # | Step | Expected | Status |
|---|------|----------|:------:|
| K1 | Trigger `twilio-open-sync` job manually | Worker processes; Twilio resources synced to DB | |
| K2 | Wait for scheduled `number-rental-billing` | Job runs; billing ledger entries created | |
| K3 | Trigger `process-audience-upload` via HTTP wake | Worker picks up job; CSV parsed; contacts created | |
| K4 | Check `supabase/functions/` directory | **Does not exist** (deleted) | |
| K5 | Check Railway services | `callcaster-review` (web) + `callcaster-worker` (Bun worker) running | |
| K6 | Worker failure + retry | Dead-letter or retry visible in job table / logs | |

---

## L — Admin & platform

| # | Step | Expected | Status |
|---|------|----------|:------:|
| L1 | Platform admin login | Access to `/admin/*` routes | |
| L2 | View all workspaces list | Paginated; no workspace data leakage | |
| L3 | Impersonate workspace | Session scoped to workspace; audit log entry | |
| L4 | View billing reconciliation | Matches Stripe dashboard; no unbilled Twilio events | |
| L5 | Run `npm run tools:api:surface:check` | OpenAPI surface unchanged | |

---

## M — API keys & external integrations

| # | Step | Expected | Status |
|---|------|----------|:------:|
| M1 | Generate workspace API key | SHA256 hash stored; raw key shown once | |
| M2 | Call API with `X-API-Key` header | Authenticated as workspace; `verifyApiKeyOrSession` passes | |
| M3 | Call API with invalid key | 401; no timing leak | |
| M4 | Check `api-auth.server.ts` | Custom SHA256 auth preserved (not Better Auth API keys) | |

---

## Regression checklist (things that must NOT break)

| # | Check | How to verify | Status |
|---|-------|-------------|:------:|
| R1 | **No Supabase imports in app/** | `rg -i supabase app/ --files-with-matches` → empty | |
| R2 | **No `database.types.ts`** | `ls app/lib/database.types.ts` → No such file | |
| R3 | **No `supabase.server.ts`** | `ls app/lib/supabase.server.ts` → No such file | |
| R4 | **No `@supabase/*` in package.json** | `rg '"@supabase' package.json` → empty | |
| R5 | **No `SUPABASE_*` in env.server.ts** | `rg supabase app/lib/env.server.ts` → empty | |
| R6 | **No `supabase/functions/` directory** | `ls supabase/functions/` → No such file | |
| R7 | **No Deno tests in test/** | `rg -i deno test/` → empty | |
| R8 | **No Edge Function references in Twilio** | Callback URLs use `/api/…` (not `/functions/v1/…`) | |
| R9 | **No `supabase.from("…")` in runtime** | `rg -i '\.from\(' app/` — verify no tenant-table queries | |
| R10 | **Tenant-db scoping enforced** | `createTenantDb` used; `workspace_id` auto-injected | |

---

## Post-test sign-off

| Gate | Requirement | Tester | Date | Status |
|------|-------------|--------|------|:------:|
| G3 | Zero Supabase grep + primary smoke (S1–S4) | | | |
| G4 | 77/77 E2E + manual Twilio smoke (A–M above) | | | |
| G5 | Storage copy verified; worker replaces all pg_cron | | | |
| G6 | Prod maintenance window + env flip + smoke | | | |

**After sign-off:**
1. Update `migration-delivery-board.md` snapshot
2. Tag commit as `g3-zero-supabase`
3. Open PR from `feat/supabase-postgres-migration` → `main`
4. Attach this test plan as PR description evidence

---

## Appendix: Quick shell verification

```bash
# Primary exit criterion
rg -i supabase --glob '!docs/**' --glob '!archive/**'
# → 0 matches

# No Supabase packages
npm ls @supabase/supabase-js @supabase/ssr 2>/dev/null || true
# → (empty)

# Key files deleted
test ! -f app/lib/supabase.server.ts
test ! -f app/lib/database.types.ts
test ! -d supabase/functions/

# Full staging gate
npm run typecheck && npm run lint && npm run test:node && npm run test:ui
npm run test:e2e   # 77/77 on Railway review

# Manual smoke checklist (see A–M above)
```

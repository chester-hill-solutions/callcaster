# CallCaster E2E Nitpick Audit — Remediation Plan

**Date:** 2026-07-15  
**Prepared from:** Playwright-driven in-workspace audit on Railway review env (`visual-asset-review`)  
**Environment:** `https://callcaster-review-visual-asset-review.up.railway.app/`  
**Test workspace:** `25dcc770-e805-4162-8940-ab7f95fd57c1` (owner, incomplete onboarding, 0 credits)  
**Test campaigns:** `Audit Live Campaign` (id 1, live call), `Audit SMS Campaign` (id 2, message)  
**Companion artifact:** Cursor canvas `callcaster-e2e-nitpick-audit.canvas.tsx` (passes 1–4; local IDE artifact, not in repo)  
**Status:** Open — implementation not started on this branch snapshot

---

## 1. Commander's intent

Turn the review-environment nitpick audit into a sequenced, testable remediation program that:

1. **Closes exploitable data exposure first** — workspace Twilio credentials and internal tokens must never appear in serialized route `.data` payloads.
2. **Restores core campaign-manager and agent journeys** — campaign hub, join-call, and contact creation must work without crashes or infinite loading.
3. **Eliminates dead-end navigation** — broken relative links and missing nested-route outlets are fixed before polish.
4. **Raises product quality to ship bar** — dark-mode contrast, heading hierarchy, and icon accessibility are addressed in a second wave after blockers.
5. **Hardens review/staging deploys** — schema drift that caused live 500s during the audit is gated in CI/deploy, not patched ad hoc on Railway.

This plan is scoped to findings from passes 1–4 of the nitpick audit. It does not replace the broader [Critical Review Orchestration Plan](./critical-review-orchestration-plan-2026-07-12.md) or the [User Journey Audit](../user-journey-audit.md); it operationalizes the **browser-verified** gaps discovered on the review env after the earlier public/empty-state fix pass landed on `origin/dev`.

---

## 2. Key results (definition of done)

The orchestrator should not declare this plan complete until all five results are met:

| # | Result | Verification |
|---|--------|--------------|
| KR-1 | **No workspace secrets in client JSON** | Grep/test sweep: no `authToken`, workspace `token`, or `stripe_id` in any workspace route `.data` response |
| KR-2 | **Campaign hub renders** | `/workspaces/:id/campaigns/:campaignId` shows results or empty state within 3s; no React #419 / perpetual "Loading results…" |
| KR-3 | **Join campaign is safe** | `/campaigns/:id/call` does not 500 when `disposition_options` is null; join CTA hidden/disabled when `joinDisabled` is set |
| KR-4 | **Contact create works** | `/contacts/new` renders `ContactScreen` form; save round-trips |
| KR-5 | **No known dead-end CTAs** | Voicemail setup "Add a phone number" resolves; global 404 page does not throw in browser |

Secondary (wave 2) results: onboarding step 1 cannot advance empty; SMS settings label says send window not calling hours; dark-mode active nav meets contrast; icon-only controls have accessible names; structural test prevents loader secret regression.

---

## 3. Audit methodology and limitations

### What was exercised

- **Auth:** Owner session on review env; 2FA enforcement disabled via `DISABLE_2FA_ENFORCEMENT=1` on CallCaster service (dev-only unblock).
- **Surfaces:** Workspace home, campaigns list/create, campaign hub/settings/queue/script, join call, contacts list/new, audiences, scripts, audios, voicemails, settings (members, invite, webhooks), onboarding, archive, marketing chrome bleed-through, dark mode spot-check, mobile 390px on campaign settings.
- **Technique:** Playwright MCP navigation + inspection of route `.data` JSON, DOM accessibility tree, console errors, and network failures.

### What was not exercised (defer to follow-up nitpick)

- Live call screen after join fix (Twilio device, coaching panels, disposition save loop)
- Survey editor and public survey respondent flow
- Billing purchase / Stripe checkout on review env (0 credits)
- Admin surfaces
- Full keyboard-only traversal of every workspace route
- SSE reconnect behavior under forced disconnect

### Live infra mitigations (not in app code)

During the audit, review Postgres was behind app Drizzle schema. Missing columns caused 500s until migrations were applied manually:

- `campaign.sms_send_window` (`20260710010000_campaign_send_window.sql`)
- `workspace_number.twilio_phone_number_sid` (`20260710000000_workspace_number_twilio_sid.sql`)
- `outreach_attempt.callback_audit` and related typed columns
- Additional additive migrations applied in batch

**Debt:** `supabase_migrations.schema_migrations` ledger on review still lags repo. Wave 0 addresses deploy gating; do not assume review DB matches HEAD without verification.

---

## 4. Already resolved (prior pass on `origin/dev`)

These items were implemented, committed, and pushed before passes 2–4; treat as **closed** unless regression is observed:

| Area | Fix |
|------|-----|
| Workspace creation | Errors surfaced in create dialog |
| Root / workspaces index | Stripped sensitive fields from navbar/workspace list loaders |
| Mobile marketing nav | Sheet drawer + `aria-label`s |
| Home / pricing / docs | Copy and polish |
| Role cast | Migration for workspace role enum drift |
| Review DB users | nanoid→UUID repair for test accounts |
| Dev 2FA block | `DISABLE_2FA_ENFORCEMENT=1` on review CallCaster service |

---

## 5. Findings inventory

### P0 — Blockers / security

#### SEC-NITPICK-01: Workspace row leaked in route `.data` (OPEN)

**Severity:** Critical  
**Routes confirmed leaking full `workspace` row** (includes `authToken`, `token`, `stripe_id`, `twilio_data`):

| Route | Loader |
|-------|--------|
| `/workspaces/:id/contacts` | `contacts.loader.server.ts` |
| `/workspaces/:id/contacts/new` | `contacts.loader.server.ts` (parent) + `$contactId.loader.server.ts` |
| `/workspaces/:id/audiences` | `audiences.loader.server.ts` |
| `/workspaces/:id/audiences/new` | audiences new loader |
| `/workspaces/:id/scripts` | `scripts.loader.server.ts` |
| `/workspaces/:id/scripts/new` | `scripts/new.loader.server.ts` |
| `/workspaces/:id/scripts/:id` | `scripts/$scriptId.loader.server.ts` |
| `/workspaces/:id/audios` | `audios.loader.server.ts` |
| `/workspaces/:id/audios/new` | `audios/new.loader.server.ts` |

**Root cause:** `getWorkspaceById()` in `app/lib/workspace-members-db.server.ts` does `adminDb.select()` with no column projection, returning the full Drizzle workspace row. Loaders assign `workspace: workspaceData` wholesale into `routeData()`.

**Related (different field, still sensitive):** `/campaigns/:id/call.data` exposes a Twilio **capability JWT** in a `token` field — expected for client SDK init but should be documented and never confused with workspace `authToken`.

**Fix strategy:**

1. Introduce `getWorkspacePublicSummary(workspaceId)` (or `pickWorkspaceForClient(row)`) returning only UI-safe fields: `id`, `name`, `credits`, `onboarding_complete`, branding flags, etc. — explicitly omit `authToken`, `token`, `stripe_id`, `twilio_data`, internal billing keys.
2. Replace `getWorkspaceById` in **all route loaders** with the public projection. Keep `getWorkspaceById` for server-only paths (Twilio webhooks, admin, API actions) — grep before/after.
3. Add structural test `test/workspace-loader-secrets.test.ts` that asserts serialized loader fixtures never contain forbidden keys (pattern after root loader fix).
4. Optional ESLint/guard script: flag `getWorkspaceById` imports in `app/routes/workspaces+/**` loaders.

---

### P1 — High severity (broken journeys)

#### JOURNEY-NITPICK-01: Campaign hub hangs on "Loading results…" (OPEN)

**Route:** `/workspaces/:id/campaigns/:campaignId`  
**Symptom:** Perpetual loading + React error #419 (Suspense/Await boundary).  
**Note:** `get_campaign_stats(1)` returns quickly in DB; failure is client deferred/streaming wiring.

**Root cause hypothesis:**

- `$selected_id.loader.server.ts` returns `results: resultsPromise` as a deferred promise via `routeData()`.
- `$selected_id.route.tsx` wraps `<Await resolve={results}>` in nested `<Suspense>`; empty array or rejected promise may not resolve the outer boundary correctly.
- `fetchBasicResults` in `campaign-stats.server.ts` calls `rpcGetCampaignStats` — verify RPC shape matches `ResultsDisplay` expectations for live campaigns with zero attempts.

**Fix strategy:**

1. Reproduce with unit test: loader returns deferred `results`; route test renders `CampaignScreen` with resolved empty array → shows `NoResultsYet`, not infinite spinner.
2. If deferral is unnecessary for empty campaigns, await `fetchBasicResults` in loader (simplest fix) or use `defer()` explicitly per RR8 docs.
3. Add error logging in `CampaignResultDisplay` when `Await` rejects.
4. Confirm `resultsPromise || []` in loader does not mask a never-settling promise.

**Files:** `campaigns/$selected_id.loader.server.ts`, `campaigns/$selected_id.route.tsx`, `CampaignResultDisplay.tsx`, `campaign-stats.server.ts`

---

#### JOURNEY-NITPICK-02: Join Campaign 500 — `disposition_options.map` on null (OPEN)

**Route:** `/workspaces/:id/campaigns/:id/call`  
**Symptom:** Server/client crash when `campaignDetails.disposition_options` is null.  
**Secondary:** Join link still shown in campaign header despite `joinDisabled` reason.

**Root cause:** `CallScreen.Layout.tsx` line ~228:

```ts
dispositionOptions={((campaignDetails.disposition_options as unknown) as string[]).map(...)}
```

No null guard; new campaigns have `disposition_options: null` in DB.

**Fix strategy:**

1. Default to `[]` at read boundary: `campaign.server.ts` / call loader, and defensively in `CallScreen.Layout.tsx`.
2. Align `joinDisabled` with header join CTA — disable/hide when readiness says not joinable.
3. Add test: call route loader + layout render with `disposition_options: null`.

**Files:** `CallScreen.Layout.tsx`, call loader, `campaign-readiness.ts`, `CampaignHeader.tsx`

---

#### JOURNEY-NITPICK-03: Add Contact broken — no `<Outlet />` (OPEN)

**Route:** `/workspaces/:id/contacts/new`  
**Symptom:** Child route data loads; `ContactScreen` never mounts. List UI remains visible.

**Root cause:** `contacts.route.tsx` re-exports `ContactsPage` as default with no outlet. `ContactsPage.tsx` renders list only — no `<Outlet />` for `$contactId` child.

**Fix strategy (pick one, prefer A):**

- **A (recommended):** Add `<Outlet />` to `ContactsPage` (or split layout route `contacts.layout.route.tsx` with outlet + index child).
- **B:** Flatten `/contacts/new` to sibling route without nesting (more route-tree churn).

**Files:** `contacts.route.tsx`, `ContactsPage.tsx`, optionally new layout module

---

#### JOURNEY-NITPICK-04: Onboarding step 1 advances with empty fields (OPEN)

**Route:** `/workspaces/:id/onboarding`  
**Symptom:** "Save & continue" on business basics step advances without required field validation.

**Fix strategy:**

1. Add Zod (or existing form validation pattern) to `OnboardingBusinessBasicsStep` / wizard action.
2. Server-side validation in onboarding action — reject empty legal name, address, etc.
3. E2E: submit empty step 1 → stays on step 1 with field errors.

**Files:** `OnboardingWizard.tsx`, `OnboardingBusinessBasicsStep.tsx`, onboarding action server

---

#### JOURNEY-NITPICK-05: Voicemail setup CTA 404 (OPEN)

**Route:** `/workspaces/:id/voicemails/setup` (no numbers)  
**Symptom:** "Add a phone number" link resolves incorrectly; 404 page throws `ReferenceError: Buffer is not defined`.

**Root cause (link):** `setup.route.tsx` uses `<Link to="../settings/numbers" relative="path">`. From `/voicemails/setup`, this resolves to `/voicemails/settings/numbers` (404). Correct target: `/workspaces/:id/settings/numbers`.

**Fix:** Use absolute workspace-relative path: `to={`/workspaces/${workspaceId}/settings/numbers`}` from loader data, or `relative="route"` with correct segment count.

**Root cause (404 Buffer):** Global error/404 route imports Node `Buffer` without polyfill — breaks client bundle.

**Fix:** Find 404/root error boundary usage of `Buffer`; replace with browser-safe base64 (`atob`/`btoa`) or move decode server-side only.

**Files:** `voicemails/setup.route.tsx`, root or catch-all error route, `e2e/specs/voicemail-setup.spec.ts`

---

### P2 — Medium (quality / a11y / UX)

| ID | Finding | Fix direction |
|----|---------|---------------|
| UX-NITPICK-01 | SMS campaign settings show "Calling Hours" label | Use send-window copy when `campaign.type === "message"` |
| UX-NITPICK-02 | Campaign settings horizontal overflow at 390px | Audit tabs/form grid in campaign settings; `min-w-0`, responsive stack |
| UX-NITPICK-03 | Missing page `h1` / heading hierarchy | Pass with `PageShell title` or explicit `<Heading level={1}>` per route |
| UX-NITPICK-04 | Script editor: no title/back/save until dirty | Persistent header + `SaveBar` integration on script edit route |
| UX-NITPICK-05 | `SaveBar` hardcoded `bg-white`, red destructive | Design tokens + dark mode (`bg-background`, semantic destructive) |
| UX-NITPICK-06 | Campaign queue: Next enabled at 0 results | Disable when `totalCount === 0` |
| UX-NITPICK-07 | Workspace SSE console errors on healthy pages | Investigate EventSource URL/auth; downgrade or fix reconnect |
| UX-NITPICK-08 | Settings invite: error without `aria-invalid` | Wire `FormField` error to input `aria-describedby` |
| UX-NITPICK-09 | Marketing chrome on all workspace pages | Confirm layout intent; hide marketing header inside `/workspaces/*` if unintended |
| UX-NITPICK-10 | Onboarding progress bar missing `aria-valuenow` | Add progressbar role + values |
| UX-NITPICK-11 | Empty Members list, empty billing usage table | Empty-state components with CTA |
| A11Y-NITPICK-01 | Dark mode: pale `brand-secondary` on active sidebar + marketing header | Token audit in `WorkspaceNav`, `Navbar` for `dark:` contrast |
| A11Y-NITPICK-02 | Unlabeled icon buttons | Add `aria-label`: user menu, Settings gear, Scripts Download/Edit, queue sort, SMS composer |

---

### P3 — Low

| ID | Finding | Fix direction |
|----|---------|---------------|
| LOW-NITPICK-01 | Duplicate unlabeled combobox nodes (Select primitive) | Audit Radix Select trigger `aria-label` or visible label association |
| LOW-NITPICK-02 | Archive empty state says "Create Your First Campaign" when drafts exist | Conditional copy based on draft count |

---

## 6. Implementation waves

### Wave 0 — Review env hygiene (infra, parallel to code)

**Goal:** Prevent repeat of audit-time 500s from schema drift.

| Task | Owner | Notes |
|------|-------|-------|
| W0-1 | Compare review `schema_migrations` to `client/migrations/` | Script or CI job |
| W0-2 | Add deploy gate: `client db push` or migration apply before app redeploy | Railway review pipeline |
| W0-3 | Document review DB refresh procedure | `docs/railway-review-env.md` |
| W0-4 | Keep `DISABLE_2FA_ENFORCEMENT=1` documented as review-only | Do not set in production |

**Exit criteria:** Fresh review deploy boots without manual SQL; campaign create + settings load without column-missing 500s.

---

### Wave 1 — Security and crash fixes (P0 + P1)

**Goal:** KR-1 through KR-5. Single PR or stacked PRs; land SEC-01 before any other loader touches.

```
W1-A  SEC-NITPICK-01   Public workspace projection + loader sweep + regression test
W1-B  JOURNEY-NITPICK-02  disposition_options null guard + join CTA gating
W1-C  JOURNEY-NITPICK-01  Campaign hub Await/defer fix + test
W1-D  JOURNEY-NITPICK-03  Contacts Outlet layout
W1-E  JOURNEY-NITPICK-05  Voicemail link + 404 Buffer fix
W1-F  JOURNEY-NITPICK-04  Onboarding step 1 validation
```

**Suggested order:** A → B → C → D → E → F (security first; call crash before hub polish).

**Per-task acceptance:**

- **W1-A:** `curl` or route test JSON for `/contacts.data` contains `workspace.id`, `workspace.name`; does **not** contain `authToken`, `token`, `stripe_id`.
- **W1-B:** `/campaigns/1/call` returns 200 HTML; no stack trace; join hidden when `joinDisabled`.
- **W1-C:** Campaign hub shows `NoResultsYet` or chart within one paint after hydration.
- **W1-D:** `/contacts/new` shows "New Contact" heading and form fields.
- **W1-E:** Voicemail setup link hits `/workspaces/:id/settings/numbers`; 404 page renders without console error.
- **W1-F:** Empty onboarding step 1 shows validation errors; step index unchanged.

---

### Wave 2 — UX, a11y, dark mode (P2)

**Goal:** Secondary key results; safe to parallelize after Wave 1 merges.

| Batch | Items |
|-------|-------|
| 2a — Campaign UX | UX-01, UX-02, UX-06, script editor header (UX-04, UX-05) |
| 2b — Global a11y | A11Y-01, A11Y-02, UX-08, UX-10 |
| 2c — Chrome & empty states | UX-09, UX-11, LOW-02 |
| 2d — Realtime | UX-07 (SSE) — may need separate spike |

---

### Wave 3 — Extended nitpick (out of scope for Wave 1–2)

Resume Playwright pass 5+ after Wave 1 lands:

- Call screen full flow (dial, disposition, coaching panels)
- Survey editor + public survey
- Billing with credits
- Admin workspace Twilio tools
- Keyboard-only audit checklist

---

## 7. File touchpoint matrix

| Finding | Primary files | Tests to add/update |
|---------|---------------|---------------------|
| SEC-01 | `workspace-members-db.server.ts`, new `workspace-public.server.ts`, all loaders using `getWorkspaceById` in `workspaces+/` | `workspace-loader-secrets.test.ts` |
| JOURNEY-01 | `$selected_id.loader.server.ts`, `$selected_id.route.tsx`, `CampaignResultDisplay.tsx` | UI test for empty results |
| JOURNEY-02 | `CallScreen.Layout.tsx`, `CampaignHeader.tsx`, call loader | `db-campaign.server.test.ts` null disposition |
| JOURNEY-03 | `ContactsPage.tsx`, `contacts.route.tsx` | `workspace-contacts.route.test.ts` |
| JOURNEY-04 | `OnboardingWizard.tsx`, onboarding action | E2E onboarding spec |
| JOURNEY-05 | `voicemails/setup.route.tsx`, error/404 route | `voicemail-setup.spec.ts`, `test/ui/voicemail-setup.test.tsx` |
| UX-05 | `SaveBar.tsx` | Visual/dark mode spot test |
| A11Y-01 | `WorkspaceNav.tsx`, `Navbar.tsx` | Manual dark mode checklist |

### Loaders requiring workspace projection audit (non-exhaustive — re-grep at implementation)

```
app/routes/workspaces+/$id/contacts.loader.server.ts
app/routes/workspaces+/$id/contacts/$contactId.loader.server.ts
app/routes/workspaces+/$id/audiences.loader.server.ts
app/routes/workspaces+/$id/scripts.loader.server.ts
app/routes/workspaces+/$id/scripts/new.loader.server.ts
app/routes/workspaces+/$id/scripts/$scriptId.loader.server.ts
app/routes/workspaces+/$id/audios.loader.server.ts
app/routes/workspaces+/$id/audios/new.loader.server.ts
app/routes/workspaces+/$id/audios/record.loader.server.ts
app/routes/workspaces+/$id/analytics.loader.server.ts
```

Server-only `getWorkspaceById` call sites (Twilio, admin, API) — **do not** switch to public projection without reviewing credential needs.

---

## 8. Test plan

### Automated

| Check | Command / location |
|-------|-------------------|
| Typecheck + lint | `npm run ci:local` (or constituent scripts) |
| Loader secret regression | New `workspace-loader-secrets.test.ts` |
| Campaign stats empty | Extend `db-campaign.server.test.ts` |
| Contacts nested route | Extend `workspace-contacts.route.test.ts` |
| Voicemail setup link | `test/ui/voicemail-setup.test.tsx`, `e2e/specs/voicemail-setup.spec.ts` |
| Route tree | `npm run tools:routes:verify` |

### Manual (review env)

After deploy to `visual-asset-review`:

1. **Secret sweep:** DevTools → Network → `*.data` on contacts, audiences, scripts, audios → confirm no `authToken`.
2. **Campaign hub:** Open live campaign id 1 → results or empty state, no #419.
3. **Join call:** Navigate to call route → no 500; disposition dropdown empty-safe.
4. **New contact:** `/contacts/new` → form visible → save creates row.
5. **Voicemail:** Setup with 0 numbers → link opens settings/numbers.
6. **Onboarding:** Fresh workspace → step 1 empty submit blocked.
7. **Dark mode:** Toggle theme → sidebar active item readable.

### Regression risks

| Change | Risk | Mitigation |
|--------|------|------------|
| Workspace projection | Server code expecting full row from shared helper | Separate `getWorkspaceById` (server) vs `getWorkspaceForClient` (routes) |
| Await removal | Slower campaign hub TTFB | Benchmark; re-defer only stats RPC if needed |
| Contacts layout | List/detail layout break on mobile | Visual check list + detail routes |

---

## 9. Repository invariants (agents must follow)

From `AGENTS.md` — all implementation work must:

- Use `createTenantDb(workspaceId)` for tenant table access in routes.
- Never expose provider credentials in HTTP responses.
- Use top-level imports; exhaustive TypeScript switches.
- Not modify `.env`.
- Prefer `app/components/ui/` primitives and design-system patterns.
- Run `npm run ci:local` before PR.

---

## 10. Suggested PR structure

| PR | Title | Waves |
|----|-------|-------|
| 1 | `fix(security): strip workspace secrets from workspace route loaders` | W1-A |
| 2 | `fix(campaign): hub results loading and call screen null dispositions` | W1-B, W1-C |
| 3 | `fix(contacts): render nested contact form via Outlet` | W1-D |
| 4 | `fix(navigation): voicemail setup link and client-safe 404` | W1-E |
| 5 | `fix(onboarding): validate business basics before advance` | W1-F |
| 6 | `polish(ui): dark mode, a11y labels, campaign copy` | Wave 2 |

PR 1 should merge first; PR 2–5 can stack or parallelize after PR 1 base.

---

## 11. Coverage matrix (audit passes 1–4)

| Surface | Pass | Status |
|---------|------|--------|
| Sign-in / workspace pick | 1 | OK |
| Workspace create dialog | 1 | Fixed (prior pass) |
| Root / workspaces data leak | 1 | Fixed (prior pass) |
| Mobile marketing nav | 1 | Fixed (prior pass) |
| Onboarding wizard | 2 | **Open** — validation |
| Campaign create (live/SMS) | 2 | OK |
| Campaign hub / results | 2–3 | **Open** — hang |
| Campaign settings / queue / script | 3 | OK with notes (SMS label, mobile overflow) |
| Join campaign / call | 3 | **Open** — 500 |
| Contacts list | 3 | OK |
| Contacts new | 3 | **Open** — no Outlet |
| Audiences / scripts / audios | 3–4 | **Open** — secret leak |
| Voicemails setup | 4 | **Open** — bad link |
| Settings members / invite / webhooks | 4 | Minor a11y |
| Archive | 4 | LOW copy |
| Dark mode / mobile 390px | 4 | **Open** — contrast, overflow |
| Marketing chrome in workspace | 4 | **Open** — investigate |

---

## 12. Out of scope (this plan)

- Live coaching / media-stream feature work (separate branch per git status)
- CHS auth package adoption (critical review plan)
- Production cutover / billing reconciliation
- Full user-journey audit re-write (51 journeys) — only nitpick findings herein
- Penetration test of API keys / webhook signature bypass (covered elsewhere)

---

## 13. Open questions

| # | Question | Default if unanswered |
|---|----------|----------------------|
| Q1 | Should workspace layout stop rendering marketing `Navbar` inside `/workspaces/*`? | Yes — use workspace-only chrome |
| Q2 | Await vs await-in-loader for campaign stats? | Await in loader unless perf regression |
| Q3 | Contacts: master-detail on desktop vs full-page new? | Outlet with conditional list hide on child |
| Q4 | Wave 0 migration gate in CI vs Railway deploy hook? | Both: CI fails on drift; deploy applies pending |

---

## 14. References

- [Critical Review Orchestration Plan](./critical-review-orchestration-plan-2026-07-12.md)
- [User Journey Audit](../user-journey-audit.md)
- [Railway review env](../railway-review-env.md)
- [Design system](../design-system.md)
- Agent transcript: [E2E nitpick session](cursor://agent-transcripts/e6927693-6401-46f6-a867-5c04ec9782de)

---

*Last updated: 2026-07-15 — synthesizes audit passes 1–4 and prior `origin/dev` fix pass.*

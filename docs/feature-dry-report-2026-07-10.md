# CallCaster — Feature Inventory & DRY Report

**Date:** 2026-07-10 · **Branch:** `feat/supabase-postgres-migration` (CI green, PR #1036)
**Scope:** `app/` (~109k LOC), `services/media-stream`, `vendor/scriptkit`, `test/`, `e2e/`

---

## 1. Executive summary

- **26 product features** across 7 surfaces: workspace web UI, admin panel, integrator REST API, internal fetcher API, Twilio webhooks, cron jobs, public pages.
- **~170 canonical routes** (130 `*.route.tsx` + 143 `api+` modules), 99 loaders / 144 actions, 148 server lib files, 160 components.
- **Test posture is strong for this size**: 220 node test files, 42 UI test files, 25 Playwright specs, plus a bun runtime suite and a compose E2E gate (77/77). The gaps are **depth on money paths** and a few UI clusters, not breadth.
- **Addressable duplication ≈ 3,500–4,500 LOC**: ~850–1,600 server (hand-rolled route preambles, dual auth/Twilio entry points, ad-hoc error envelopes), ~830 UI (confirm dialogs, raw palette/headings, uploader copies), **1,763 LOC confirmed-dead components**, plus test-mock boilerplate across ~80 files.
- **Top risks:** (1) shallow tests on Stripe webhook / credit-debit primitives, (2) duplicate-webhook double-billing untested, (3) two parallel API-auth code paths that can drift, (4) a dual API surface (flat fetcher routes vs platform REST) serving the same domains.
- **Healthy invariants worth protecting:** every credit write already goes through the idempotent ledger RPC; Twilio webhook signature validation is centralized (28 routes); fetcher→toast is already solved (`useFetcherOnIdle`/`useActionFeedback`, 33 adopters).

---

## 2. Master feature registry

| ID | Feature | Surfaces | Auth model | Coverage tier |
|----|---------|----------|-----------|---------------|
| F1 | Auth / session | Web, API | Public entry → session; bearer/API auth routes | Partial→Good (thin boundary suites) |
| F2 | Workspace management | Web, API | Session; platform API `requireJsonAuth` | Good |
| F3 | Onboarding wizard | Web, API | Session | **Partial** (no route/UI tests; e2e only) |
| F4 | Team / invites | Web, API, Admin | Public accept / session / sudo | Good |
| F5 | Campaigns (create/settings/home) | Web, API | Session / dual | Strong |
| F6 | Call screen / agent dialer | Web, Twilio | Session / Twilio signature | Strong |
| F7 | ACD / inbound call routing | Twilio, API | Twilio signature / session | Strong |
| F8 | Chats / SMS inbox | Web, API, Twilio | Session / integrator key / Twilio | Strong |
| F9 | Contacts | Web, API | Session / `requireJsonAuth` | Strong |
| F10 | Audiences (+uploads) | Web, API | Session / `requireJsonAuth` | Strong |
| F11 | Scripts / IVR editor | Web, API, Twilio | Session / Twilio (runtime) | Good (**no editor UI tests**) |
| F12 | Surveys (builder + public taker) | Web, Public, API | Session / public / dual | Good (**no builder UI tests**) |
| F13 | Voicemails / audio drop | Web, API, Twilio | Session / Twilio / dual | Good |
| F14 | Phone-number management | Web, API | Session / `requireJsonAuth` | Good (no numbers e2e) |
| F15 | Caller-ID / number verification | API, Twilio | Twilio / session | Good |
| F16 | Billing / credits | Web, API, Stripe | Session / Stripe webhook / dual | Good (**depth gap — see §6**) |
| F17 | Analytics | Web, API | Session / `requireJsonAuth` | Good |
| F18 | Exports | Web, API | Session / dual | Good |
| F19 | Handset / softphone | Web, API | Session / dual | Good |
| F20 | Admin panel | Admin | `requireSudoAdmin` / workspace-admin | Good (no admin UI unit tests) |
| F21 | Twilio compliance (A2P/TrustHub) | API, Twilio, Admin | Twilio / sudo | Good |
| F22 | API keys / integrator API | Web, Public API | Session (manage) / API key (use) | Good |
| F23 | API docs / OpenAPI | Public | Public | Good (generated + surface check in CI) |
| F24 | Background jobs (cron) | Jobs | `x-cron-secret` | Good |
| F25 | Marketing / landing | Public | Public | Weak (fine for static pages) |
| F26 | Diagnostics / misc (`error-report`, `test-webhook`, `me`, `call-status`) | API | Mixed | Good |

Integrator-exposed paths (per `app/lib/public-api.ts`): exactly `/api/campaigns/create-with-script`, `/api/chat_sms`, `/api/sms`. All other `api+/workspaces+/*` routes accept API key **or** session (`requireJsonAuth`) — intended exposure is an open question (§9).

---

## 3. Layer inventory (what's already centralized)

**Working well — protect, don't rebuild:**
- **Credit ledger:** all writes via `insertTransactionHistoryIdempotent` → `apply_ledger_entry_and_sync_credits` RPC (16 call sites); reads via `getWorkspaceCreditsBalance`. No direct `credits:` updates exist.
- **Twilio webhook auth:** `requireTwilioSignature` (`app/lib/twilio-webhook.server.ts`) used by 28 routes; zero ad-hoc signature checks.
- **Fetcher feedback:** `useFetcherOnIdle` + `useActionFeedback` (33 adopters).
- **Test helpers:** `test/helpers/` (route-auth-mock, session-mock, tenant-db-stub, telephony-db-stub, transaction-history-stub) consumed by 43 test files.
- **Design system:** DESIGN.md + `PageShell`, `StatusBadge`, `WorkspaceResourceListShell`, `Heading`/`Text`, `FormField` (26 adopters), `toUserMessage`.
- **DB boundary:** `adminDb` (25 files, global) vs `createTenantDb` (75 files, tenant-scoped) — deliberate; document the rule.

**Existing-but-underadopted (the cheapest DRY wins):**
- `requireWorkspaceLoaderContext` (`app/lib/workspace-route.server.ts`): 12 of 58 workspace route files use it; 48 still call `verifyAuth` by hand.
- `toUserMessage` (`app/lib/user-message.ts`): **zero server consumers**; 254 ad-hoc `routeData({ error })` sites.
- `readTwilioWorkspaceCredentials`: 13 adopters; 2 inline `JSON.parse(twilio_data)` stragglers + a third parse path in `twilio-webhook.server.ts`.

---

## 4. DRY analysis — ranked items

| # | Item | Sites | ~LOC | Proposed module | Phase |
|---|------|-------|------|-----------------|-------|
| D1 | Money-path test depth (Stripe idempotency, duplicate call-status double-billing, `workspace-credits.server` unit tests) | — | n/a (tests) | new tests only | **P0** |
| D2 | Dual API-auth helpers + 7 hand-rolled `authType === "api_key"` branches | 21 | 300–450 | single `requireDualAuth` shape in `api-auth.server.ts`; retire `verifyApiKeyOrSession` | **P0** |
| D3 | Dual Twilio client entry (`createWorkspaceTwilioInstance` vs `createWorkspaceTwilioClient` w/ retry) + inline `twilio_data` parses | ~20 | ~50 | one entry in `twilio-client.server.ts`; all credential reads via `readTwilioWorkspaceCredentials` | **P0** |
| D4 | Ledger invariant guardrail (doc + lint/test forbidding direct `credits:` writes) | — | ~20 | note in DESIGN.md/ADR + a grep-based check script | **P0** |
| D5 | Dead components | 15 files | **1,763** | delete (list §7) | **P1** |
| D6 | Workspace loader/action preamble adoption | 46 files | 500–700 | adopt `requireWorkspaceLoaderContext` | **P1** |
| D7 | Error envelope unification | 254 | 250–400 | `routeError(error, fallback, opts)` in `errors.server.ts` wrapping `toUserMessage` + `getErrorDetail` logging; migrate opportunistically | **P1** |
| D8 | Hand-rolled confirmation dialogs | 5 | ~150 | `ui/confirm-dialog.tsx` per DESIGN.md shape | **P1** |
| D9 | Raw palette utilities (worst 8 files: AudienceUploader, ResultsScreen.KeyMetrics, shared/ErrorBoundary, ResultsScreen.Disposition, ContactSearchDialog, ContactDetailsOtherFields, SoftphoneAudioControls, ChatHeader) | 59 files | ~250 occ. | semantic tokens + `StatusBadge` | **P1** (worst 8) / P2 (rest) |
| D10 | Test-infra mocks: no `admin-db-stub` (10 hand-rolled), no drizzle `createDbChainStub` (~21 inline), no shared twilio mock (52 files) | ~80 | large (test LOC) | `test/helpers/{admin-db-stub,db-chain-stub,twilio-mock}.ts` | **P2** |
| D11 | CSV/JSON file-picker triplication | 3 | ~90 | `ui/file-drop-field.tsx` | **P2** |
| D12 | `FormField` bypass | 14 files | ~210 | migrate to existing primitive | **P2** |
| D13 | Raw headings | 47 files / 83 tags | ~83 | migrate to `Heading` | **P2** |
| D14 | Raw tables/cards (QueueTable, AudienceUploadHistory + 4 card divs) | ~6 | ~120 | `ui/table` / `Card` | **P2** |
| D15 | Dual API surface: flat fetcher routes (`api+/contacts.tsx`, `audiences`, `campaigns`, `scripts`, `surveys`, `numbers`) vs platform REST (`api+/workspaces+/$workspaceId/*`) | 6 domains | large | converge on platform REST; flat routes become thin deprecated shims, then delete | **P3** (needs product decision §9) |

---

## 5. Target module layout

```
app/lib/
  api-auth.server.ts          # single dual-auth entry (D2)
  twilio-client.server.ts     # single workspace Twilio client entry (D3)
  errors.server.ts            # + routeError() consuming user-message.ts (D7)
  workspace-route.server.ts   # existing — adoption push (D6)
app/components/ui/
  confirm-dialog.tsx          # D8
  file-drop-field.tsx         # D11
test/helpers/
  admin-db-stub.ts            # D10
  db-chain-stub.ts            # D10
  twilio-mock.ts              # D10
scripts/
  check-credit-write-paths.mjs  # D4 guardrail (grep: direct credits: updates)
```

No new packages. `vendor/scriptkit/*` stays vendored until P3.

---

## 6. Roadmap with exit criteria

### P0 — correctness & drift risk
| Item | Exit criteria |
|------|---------------|
| D1 money-path tests | `workspace-credits.server` has direct unit tests (insufficient balance, concurrent debit); Stripe webhook: same `event.id` twice → one ledger row; call-status: replayed `completed` callback with same CallSid → single debit; all green in CI |
| D2 auth collapse | one exported dual-auth entry; `verifyApiKeyOrSession` deleted; 0 route-level `authType === "api_key"` branches (moved into helper); cross-workspace denial test added (user of A hitting `/api/workspaces/B/...` → 403) |
| D3 Twilio client | `createWorkspaceTwilioInstance` not imported outside `twilio-client.server.ts`; 0 inline `JSON.parse(...twilio_data)` outside `twilio-workspace-credentials.ts` |
| D4 ledger guardrail | check script wired into CI (or lint rule); ADR/DESIGN note stating "credits are ledger-only" |

### P1 — DRY within boundaries
| Item | Exit criteria |
|------|---------------|
| D5 dead code | 15 files deleted (~1,763 LOC); typecheck/lint/tests/e2e green; no `ui/command.tsx` |
| D6 preamble adoption | ≥46 of 58 workspace routes use `requireWorkspaceLoaderContext`; direct `verifyAuth(` calls under `workspaces+/$id/**` ≤ 5 (justified exceptions listed) |
| D7 routeError | helper exists + adopted in every file touched by D6; `toUserMessage` has ≥30 server consumers |
| D8 ConfirmDialog | 5 hand-rolled confirms replaced; DESIGN.md updated to point at the primitive |
| D9 palette (worst 8) | the 8 listed files have 0 raw palette classes (email templates exempt) |

### P2 — hygiene
| Item | Exit criteria |
|------|---------------|
| D10 test stubs | 3 helpers exist; ≥10 admin-db files + ≥10 chain-stub files migrated (rest opportunistic) |
| D11–D14 UI migrations | FileDropField used by all 3 pickers; FormField bypasses ≤ 5; raw h1–h3 count ≤ 20; raw tables 0 |
| Coverage additions | onboarding wizard route/action tests; script/IVR editor + survey builder smoke UI tests; media-stream: expired-token WS rejection + malformed-frame tests |
| Misc | `api.disconnect.ts` renamed into `api+/` convention or deleted; `other-services.tsx` wired or deleted |

### Phase order rule
P0 before P1 before P2. D5 (dead code) may run first inside P1 — it's zero-risk and shrinks every other sweep.

---

## 7. Dead-code deletion list (D5)

`CampaignSettings.Script.QuestionBlock.tsx` (321), `CampaignSettings.Script.IVRQuestionBlock.tsx` (289), `CampaignSettings.Script.QuestionBlock.Option.tsx` (173), `contact/ContactTable.tsx` (197), `AudienceContactRow.tsx` (185), `ui/command.tsx` (153), `handset/HandsetCallPanel.tsx` (137), `campaign/CampaignList.tsx` (90), `VoxTypeSelector.tsx` (73), `CampaignBasicInfo.SelectStatus.tsx` (39), `CampaignBasicInfo.SelectPhase.tsx` (36), `CallScreen.TopBar.tsx` (35), `invite/welcome/ErrorAlert.tsx` (21), `ResultsScreen.ExportButton.tsx` (8), `shared/CustomCard.tsx` (6).

Note: `CallScreen.TopBar`, `ErrorAlert`, and `CampaignList` received polish in the July 2026 design pass before being identified as unimported — deleting them supersedes that work. Verify each with a final grep at deletion time (imports may have appeared since this scan).

---

## 8. Deferred (P3) — evaluate separately

1. **Dual API surface convergence (D15)** — migrate UI fetchers from flat `api+/{domain}.tsx` routes onto platform REST routes, then delete the flat ones. Large blast radius; needs the D2 auth collapse landed first and a decision on which surface is canonical.
2. **`vendor/scriptkit` package extraction** — return the vendored packages to the published `@chester-hill-solutions/*` registry once their build (now fixed to ESM via `vendor/tsconfig.base.json`) is stable. Rule: not before P0/P1 modules are stable.
3. **Media-stream service hardening** — extract frame handler for unit testing; add WS lifecycle tests; consider moving under `app/` test coverage gate.
4. **Hook consolidation** — fold `useFetcherOnIdle` into `useActionFeedback` (optional; both are fine today).
5. **RLS/migration test harness** — `client/migrations/*.sql` are hand-written with a ledger check; no automated schema-drift test exists (`app/db/schema.ts` is hand-synced by policy — see `drizzle.config.ts` DANGER note).

---

## 9. Open questions (product input required)

1. **Canonical API surface:** flat fetcher routes vs `api+/workspaces+/$workspaceId/*` REST — which wins? (Affects D15 and the OpenAPI surface.)
2. **Intended external exposure** of the non-integrator `requireJsonAuth` routes: officially public (document in OpenAPI + keys) or internal-only (drop API-key acceptance)?
3. **`other-services.tsx`**: no confirmed inbound link — wire into nav or delete?
4. **Dead-component confirmation**: OK to delete all 15 in §7, including the three polished this session?
5. **Onboarding wizard test priority**: it's the newest, most-changed surface with the weakest tests — pull its coverage work from P2 into P1?

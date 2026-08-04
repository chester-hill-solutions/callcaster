# CallCaster Component Surface Remediation Plan

**Date:** 2026-07-17  
**Prepared from:** [`docs/design-system-audit.md`](../design-system-audit.md), the whole-app component audit performed on 2026-07-17, post-audit source re-verification, DRY plan review, and local browser checks at 375 / 1280 / 1920 pixels  
**Environment:** Local `npm run dev:local` at `http://localhost:3001`; authenticated `Testing` workspace `3e021cac-242f-4f09-b78b-f94d8b01cf40`  
**Status:** Open — plan only  
**Primary policy:** [`docs/design-system.md`](../design-system.md)  
**Execution boundary:** Product UI composition, chrome contracts, responsive behavior, accessibility, tests, and confirmed dead UI. No database schema or external-provider migration is planned.

---

## 1. Commander's intent

Bring CallCaster's UI back to one predictable composition model while preserving the product journeys already working:

1. **Make the workspace panel the single in-app surface owner.** Workspace children render flat sections, semantic application panes, or entity cards with a maximum perceived depth of two.
2. **Put persistent context in chrome with a complete data contract.** Workspace selection, onboarding progress, and authorized credit visibility remain available across relevant routes and update when their source data changes.
3. **Repair interaction boundaries before visual polish.** Replace the absolute Card masquerading as a modal, fix invalid list markup, refresh stale audit claims, and preserve server-side authorization while navigation changes.
4. **Standardize high-use workflows on canonical primitives.** Forms use `FormField` and shared controls; notices use `Alert`; grids use the shared table vocabulary; call panes use `call-panel-classes`.
5. **Deliver responsive, accessible work surfaces.** Required routes work at 375, 1280, and at least 1920 pixels in light and dark themes with named controls, valid landmarks, and keyboard-operable overlays.
6. **Remove confirmed compatibility debris.** Delete inactive aliases and orphan components only after import, route, and test evidence proves they have no runtime contract.

This plan does not replace the design-system policy, the migration/cutover plans, the critical security review, or feature-specific product requirements. It translates the component audit into mergeable implementation work.

---

## 2. Key results / definition of done

| ID | Result | Verification |
|----|--------|--------------|
| KR-1 | Every audited workspace child route has a documented visual depth of 1–2; no generic Card-inside-Card or depth ≥3 remains | Source scan + route coverage matrix + browser screenshots |
| KR-2 | Workspace creation/list/detail flows use `PageShell`, flat `Section`, canonical empty states, and semantic entity/application panes consistently | Focused UI tests and route review |
| KR-3 | Existing desktop/mobile workspace picker is covered for authorized choices, truncation, current selection, and root-only switching | Navbar tests + browser switching checklist |
| KR-4 | Successful ledger inserts emit canonical `transaction_history` events; one workspace-tree subscriber revalidates desktop, mobile, sidebar, and low-credit surfaces | Emitter test + realtime hook test + purchase/debit browser smoke |
| KR-5 | Onboarding has one progress surface (`OnboardingProgressStrip`), flat step content, and one stable `onboarding-step` selector | Unit/E2E tests + 375/1280/1920 browser check |
| KR-6 | Campaign settings, phone numbers, softphone, audience detail, and contact detail satisfy the one-surface and one-padding-owner rules | Targeted component tests + source composition review |
| KR-7 | All audited overlay and list-structure defects are repaired: IVR edit uses `Dialog`, services markup is valid, icon actions are named and keyboard reachable | UI tests + accessibility queries |
| KR-8 | Touched surfaces use semantic status tokens and work-surface typography; no new raw palette classes or work-surface slab headings enter the diff | ESLint/source scan + visual review |
| KR-9 | Confirmed orphan/compatibility components are removed with imports and tests adjusted; no runtime route changes unexpectedly | import scan + typecheck + route verification |
| KR-10 | Each implementation PR passes focused tests, and the final integration passes `npm run ci:local` in a clean/isolated worktree | CI logs |

### Secondary results

- Admin tables own responsive overflow and admin detail routes do not render the dashboard above their outlet.
- Chat attachment actions work by keyboard and touch.
- Campaign result bars expose progress semantics.
- Form descriptions/errors are programmatically linked through `FormFieldControl`.
- The design-system audit and route coverage matrix remain current as remediation lands.

---

## 3. Methodology and limitations

### Evidence used

- Inventory of 169 component TSX files, 30 UI primitives, 13 shared compositions, and 101 non-API route TSX modules.
- Static tracing of route → composition → surface stacks.
- Searches for `Card`, `BrandedCard`, `Section`, ad hoc `rounded + border/background/shadow`, raw palette classes, custom tables, raw controls, and test selectors.
- Focused source checks of workspace layout, root Navbar loader contract, onboarding progress, billing, numbers, campaign settings, call/softphone, audience, contacts, admin, and tests.
- Local authenticated browser checks at 375 / 1280 / 1920 in light theme.

### Live limitations

- Dark theme was not live-verified across the full route matrix.
- Admin, populated chats, live Twilio call state, connected softphone, and survey editor were not fully exercised live.
- Some local route navigations intermittently reached the route error boundary while the working tree/dev server was changing. Those routes are source-verified and must be rechecked in an isolated implementation branch.
- The repo started with a large user-owned working tree. Implementers must inspect current status and isolate commits; no reset, stash, or unrelated cleanup is authorized.

### Planning rules

- Re-verify each finding against current source immediately before editing.
- Prefer structural flattening over class-by-class visual imitation.
- Preserve semantic entity cards and application panes when they convey real identity or task boundaries.
- Keep browser-facing test selectors stable unless the plan explicitly relocates them.
- Treat hidden navigation as presentation only; server-side authorization remains authoritative.

---

## 4. Already resolved / preserve

| Item | Current state | Preserve |
|------|---------------|----------|
| Workspace surface owner | `$id.tsx` owns `rounded-2xl border bg-card/70 p-4 shadow-sm` | Keep one panel and skip link |
| Onboarding route chrome | `OnboardingProgressStrip` renders beneath Navbar | Keep as sole setup progress surface |
| Legacy overview implementation | `OnboardingOverviewCard.tsx` is gone and tests target ProgressStrip | Do not restore component |
| OverviewCard test coupling | Goal-step tests now import `OnboardingProgressStrip` | Preserve; no remediation commit needed |
| Onboarding step roots | Active steps already use `Section variant="flat"` | Refine inner choice/form groups only |
| Workspace picker | Typed Admin+-gated root projection, desktop DropdownMenu, and mobile workspace list are already wired | Verify, test, and avoid rebuilding |
| Billing composition | Flat `Section`, semantic `Alert`, Accordion rates, flat activity table | Use as in-panel reference |
| Calls log | Flat heading + `DataTable` | Use as list reference |
| Analytics/settings | Flat `Section` adoption | Preserve |
| Call panes | `CallArea`, `QueueList`, `Questionnaire` use `call-panel-classes` | Extend rather than replace |
| OperatorColumn | Layout-only composition | Preserve |
| People hub | Lightweight tab rail around flat route content | Preserve as local navigation |
| Auth flows | `AuthCard` on standalone pages | Preserve |
| Global feedback | One Sonner Toaster in root | Preserve |

---

## 5. Architecture decisions

### D-1 — Workspace panel ownership

Inside `/workspaces/:id`, generic route containers use:

```text
Workspace panel
├─ PageShell or flat route header
├─ Section variant="flat"
│  ├─ FormField + canonical controls
│  └─ Alert or muted inset
└─ optional semantic application pane or entity card
```

`Card`, elevated `Section`, and `BrandedCard` remain valid for standalone pages, overlays, and clearly identified entities. Creation routes nested in the workspace panel use flat branded headings/actions rather than a second elevated shell.

### D-2 — Visual depth budget

- Depth 1: workspace panel + flat content — preferred.
- Depth 2: one semantic entity, metric tile, application pane, or choice surface — allowed.
- Depth 3+: blocked unless a documented entity hierarchy requires it and a browser review approves it.
- Input/control borders do not count as surfaces; grouped bordered containers do.

### D-3 — Chrome ownership

- Navbar owns global workspace selection and optional authorized credit readout.
- `WorkspaceNav` owns workspace route navigation, not workspace selection.
- `OnboardingProgressStrip` owns setup progress.
- Campaign setup readiness should be a flat settings header/strip, not an elevated content Card.

### D-4 — Workspace projection and authorization

Preserve the existing `RootWorkspaceSummary` projection (`id`, `name`, `role`, Admin+-gated `credits`) produced by `listUserWorkspaceSummaries`. Do not add a parallel picker projection, put secrets/unrestricted workspace rows into root loader data, or weaken the current Admin+ credit policy.

### D-5 — Credit freshness

`insertTransactionHistoryIdempotent` is the canonical producer boundary. When its ledger RPC returns `inserted: true`, it emits one workspace `postgres_change` event for `transaction_history` INSERT. Client work lands only after this producer exists.

Consolidate campaign and ledger filtering into one workspace-tree `useWorkspaceEventSubscription({ table: ["campaign", "transaction_history"] })` where possible. A matching event calls `revalidator.revalidate()` so root/workspace loader data refreshes desktop Navbar, mobile menu, WorkspaceNav, and low-credit banners. Remove the duplicate desktop-only credit EventSource after parity is proven. Do not create a third credit store.

ADR-0006 permits app-emitted events after the canonical write. `docs/sse-scaling.md` limits the practical per-replica LISTEN budget, so subscription count is an acceptance criterion.

Ledger integrity outranks UI freshness: PR 2 must decide whether the RPC and durable workspace-event insert can share one application transaction. If they cannot, event emission is post-write and must not turn a committed ledger success into a reported billing failure; log/observe emission failure and retain navigation/loader revalidation as the recovery path.

### D-6 — Table strategy

- `DataTable`: sortable/filterable/paginated data grids.
- `ui/table`: small static or domain-specific tables.
- Domain wrappers may own server filtering or specialized queue actions, but shared table chrome, empty/loading states, pagination, and responsive overflow should remain centralized.

### D-7 — Primitive adoption

New or touched forms use `FormField` + `FormFieldControl` and canonical `Input`, `Textarea`, `Select`, `Checkbox`, or `Switch`. Touched notices use `Alert`; touched statuses use `Badge`/`StatusBadge` and semantic tokens.

### D-8 — Dead-code threshold

A component is removable only when:

1. no production import exists;
2. no route discovery convention references it;
3. no package/public export contract depends on it;
4. remaining tests are deleted or redirected to the active component;
5. typecheck and route verification pass.

### D-9 — API and contract impact

No public integrator/OpenAPI request or response shape changes are required. `app/lib/openapi.ts`, generated API clients, and data-plane route URLs remain unchanged.

Wave 1 adds an internal workspace event producer at the centralized ledger write boundary. Preserve the existing `PostgresChangePayload` shape and authenticated SSE endpoint. Route UI waves preserve loader/action payloads, `_action` names, form names, test IDs, and middleware. Admin restructuring preserves URLs and outlet context; run route-tree and middleware guards if module boundaries move.

---

## 6. Findings inventory

### P1 — Structural and interaction blockers

#### SURF-ONB-01 — Onboarding inner choice/form groups remain over-boxed

- **Routes:** `/workspaces/:id/onboarding`
- **Symptom:** active step roots are flat Sections, but several steps still repeat `rounded-lg border p-4` choice/form groups.
- **Root cause:** Root flattening landed before inner grouping semantics were normalized.
- **Fix:** Preserve active `Section variant="flat"` roots; replace generic inner boxes with semantic fieldsets, dividers, choice rows, or muted insets where they read as extra surfaces.
- **Primary files:** onboarding step files, `OnboardingWizard.tsx`, `OnboardingProgressStrip.tsx`.
- **Tests:** onboarding goal/intro/first-number/workspace tests; `e2e/pages/OnboardingPage.ts`.

#### SURF-NUM-01 — Phone numbers has an ad hoc brand Panel around Cards

- **Route:** `/workspaces/:id/settings/numbers`
- **Symptom:** panel → local `Panel` (`bg-brand-secondary`) → per-number/empty Cards.
- **Root cause:** route-local shell predates workspace panel ownership.
- **Fix:** Replace route shell with `PageShell` + flat sections; preserve per-number semantic entity cards at depth 2; flatten empty states and purchase/caller-ID containers.
- **Primary files:** numbers route, `NumberSummaryList`, `NumbersTable`, number purchase/search components.

#### SURF-PHONE-01 — Softphone/AgentDesktop reaches depth 3–4

- **Route:** `/workspaces/:id/handset`
- **Symptom:** panel → `container p-6` → `BrandedCard` → bordered/colored subpanels → held-call rows.
- **Root cause:** standalone demo composition mounted inside the workspace panel.
- **Fix:** Make `AgentDesktop`/`SoftphonePanel` flat; use one named softphone application pane if needed; convert held/audio states to semantic alerts or muted subsections.
- **Primary files:** `AgentDesktop`, `SoftphonePanel`, `OutboundDialer`, `HeldCallsList`, `SoftphoneAudioControls`.
- **Boundary:** Presentation-only changes. Preserve ADR-0024's shared `useCallHandling` and existing `app/hooks/call/*` behavior/wiring paths.

#### SURF-CAMP-01 — Campaign settings has container Cards and nested summaries

- **Route:** `/workspaces/:id/campaigns/:id/settings`
- **Symptom:** panel → bordered settings section → SetupGuide/CostPanel Card → tiles/insets.
- **Root cause:** settings grew by appending independent card components.
- **Fix:** Introduce flat campaign settings sections; make readiness a route/settings strip; flatten `CampaignCostPanel` outer Card while retaining semantic metric tiles.
- **Primary files:** `CampaignSettings`, `CampaignSetupGuide`, `CampaignCostPanel`, basic/detailed settings compositions.

#### SURF-AUD-01 — Audience detail/upload reaches depth 3–4

- **Routes:** audience detail and new/upload.
- **Symptom:** panel → tab white/shadow shell or BrandedCard → mapping shell → preview/table border.
- **Fix:** Preserve `PeopleHubLayout` as the tab rail and flatten its Tabs content; use one muted mapping region and one table boundary.
- **Primary files:** audience routes, `AudienceUploader`, `AudienceUploadHistory`, `AudienceTable`.

#### SURF-CON-01 — Contact detail and activity use Card-inside-Card

- **Route:** `/workspaces/:id/contacts/:contactId`
- **Symptom:** panel → ContactDetails Card → RecentContacts elevated attempt Cards.
- **Fix:** Flat contact details under PageShell; activity as Accordion/divided list or restrained semantic rows.
- **Primary files:** contact route, `ContactDetails`, `RecentContacts`, other-field editor.

#### A11Y-IVR-01 — IVR response editor is an absolute Card, not a modal

- **Symptom:** no dialog semantics, focus trap, Escape behavior, overlay, or reliable mobile positioning.
- **Fix:** Recompose with canonical `Dialog`, labelled fields, and canonical Select.
- **Primary file:** `QuestionCard.ResponseTable.EditModal.tsx`.
- **Tests:** add open/focus/save/cancel/Escape behavior.

#### HTML-PUB-01 — `/services` nests list items

- **Symptom:** route `<li>` wraps a `ServiceCard` that also returns `<li>`.
- **Fix:** Choose one list-item owner; prefer `ServiceCard` as `<article>`/`div` within the route-owned `<li>`.
- **Acceptance:** valid list structure test.

#### ROUTE-ADMIN-01 — Admin parent renders dashboard above nested routes

- **Routes:** admin detail/dead-letter/workspace children.
- **Symptom:** parent dashboard content renders before `<Outlet>`.
- **Fix:** Make dashboard index-only and let child routes occupy the admin page shell.
- **Primary files:** admin route structure and route-tree baseline only if URLs change.
- **Constraint:** Preserve admin middleware and route authorization.

### P2 — Chrome, consistency, accessibility, and responsive work

#### CHROME-WS-01 — Existing workspace picker lacks dedicated contract coverage

- **Current:** typed root projection, desktop DropdownMenu picker, and mobile workspace links are implemented.
- **Fix:** Add RBAC/projection, truncation, current-selection, and root-destination tests; refresh stale audit claims.
- **Behavior:** same authorized list on desktop/mobile; long names truncate; switching never carries old-workspace resource IDs.

#### CHROME-CRED-01A — Ledger writes do not emit subscribed credit events

- **Symptom:** Navbar and call-session code subscribe to `transaction_history`, but `insertTransactionHistoryIdempotent` only invokes the RPC and logs.
- **Fix:** Emit one `postgres_change` `transaction_history` INSERT event when the centralized ledger write returns `inserted: true`; emit nothing for idempotent duplicates.
- **Tests:** emitter unit/integration test around inserted vs existing ledger rows.

#### CHROME-CRED-01B — Credit revalidation is duplicated and incomplete

- **Symptom:** desktop Navbar owns a credit EventSource; workspace layout owns a separate campaign EventSource; mobile credits, WorkspaceNav, and low-credit banners can remain stale. The producer is currently absent.
- **Fix:** After 01A, consolidate campaign + ledger filters at the workspace tree, revalidate loaders, and remove duplicate widget-level subscription if root/workspace parity holds.
- **Tests:** multi-table subscription, unrelated-event filtering, one revalidation per matching event, mobile/sidebar/banner parity.

#### SURF-EMPTY-01 — In-panel empty states use Cards

- **Files:** ResourceListShell, ContactsPage, NumbersTable, NumberSummaryList, CampaignEmptyState, ConversationList transparent Card.
- **Fix:** Add/standardize one flat empty-state composition with optional illustration/action; remove transparent Cards.

#### SURF-CREATE-01 — Workspace creation routes use BrandedCard inside panel

- **Routes:** campaign/audience/script/audio creation and voicemail setup.
- **Fix:** Flat `PageShell maxWidth="narrow"` + branded CTA/title accents; reserve BrandedCard for standalone flows.

#### SURF-SURVEY-01 — Survey builder nests page and question Cards

- **Fix:** Flat page sections with question entity rows/insets; retain visual identity of pages/questions without stacked elevation.
- **Constraint:** Documented survey page → question hierarchy may retain one semantic depth, never panel → Card → Card elevation.

#### CALL-UI-01 — Call shell variants drift

- **Items:** Household ad hoc shell, StatusBar/header class divergence, DTMF/keypad duplication, CallContact hex colors.
- **Fix:** Add documented call-panel variant(s), unify keypad behavior where practical, use semantic tokens, add accessible digit names.
- **Preserve:** OperatorColumn ordering, test IDs, Sheets, call action behavior.

#### CHAT-UI-01 — Chat controls duplicate primitives

- **Items:** bespoke ChatHeader menus, raw ChatInput controls, hover-only ChatImages removal, transparent empty Card.
- **Fix:** DropdownMenu/Select/Textarea/Checkbox/Button/Alert; permanently visible or focus-revealed named remove button.

#### FORM-A11Y-01 — FormField descriptions/errors are incompletely wired

- **Fix:** Use `FormFieldControl` on touched fields; label campaign SelectType/SelectNumber, MessageSettings textarea, admin filters, and dynamic contact controls.

#### TOKEN-UI-01 — Raw palette and work-surface slab typography

- **Scope:** touched files first: WorkspaceNav status, TeamMember, softphone states, campaign results/readiness, queue/chat banners, CallContact, root Switch primitive.
- **Fix:** semantic status tokens and `Heading`/`Text`; keep Tabac/Zilla in documented character zones.

#### TABLE-UI-01 — Data-grid infrastructure is split

- **Scope:** QueueTable, AudienceUploadHistory, NumbersTable, admin tables.
- **Fix:** Extract shared overflow/empty/loading/pagination patterns before replacing specialized behavior. Migrate simple tables first; preserve queue's server filters/actions behind a domain wrapper.

#### ADMIN-RESP-01 — Admin tables/forms lack narrow-screen ownership

- **Fix:** overflow containers, stacked filter toolbars, labelled inputs, flat definition grids in Twilio panels.
- **Browser:** verify 375 and 1280; admin ultrawide remains full-content.

#### PUBLIC-RESP-01 — Narrow public/auth defects

- **Items:** signup closed state `min-w-[400px]`, fixed-width dialogs, service/pricing surface over-boxing.
- **Fix:** fluid widths and responsive DialogContent; keep marketing character typography.

### P3 — Cleanup and deferred polish

| ID | Item | Default |
|----|------|---------|
| DEAD-01 | `CustomCard` compatibility alias | Delete after import scan |
| DEAD-02 | `HandsetCallPanel` orphan | Delete; handset route uses AgentDesktop |
| DEAD-03 | `CallScreen.TopBar` orphan | Delete after call route/import scan |
| DEAD-04 | inactive class `ErrorBoundary` | Delete if root/routes use RouteErrorBoundary exclusively |
| DEAD-05 | ContactTable → AudienceContactRow inactive chain | Delete together after import scan |
| DEAD-06 | legacy campaign controls (`VoxTypeSelector`, SelectStatus, old question blocks, sync export button) | Audit individually; delete only confirmed orphans |
| ICON-01 | Remaining `react-icons` | Migrate opportunistically; keep Result.IconMap |
| A11Y-METRIC-01 | Campaign disposition/IVR bars | Add progress semantics |
| ASSET-01 | TransparentBGImage interaction layer | Add `pointer-events-none` and `aria-hidden` where decorative |
| TEST-GAP-01 | Analytics/audio/ChatImages/admin UI coverage | Add focused behavior/accessibility tests |

---

## 7. Implementation waves

### Wave 0 — Baseline, safeguards, and broken coupling

**Goal:** Establish a stable measurement and test foundation before layout changes.

1. Capture current branch, HEAD, status, route tree, and user-owned changed files.
2. Run focused current tests for onboarding, workspace nav, numbers, campaign settings, call screen, audience, contacts, and shared compositions; record pre-existing failures.
3. Re-baseline findings already changed in the working tree: picker/projection, onboarding flat roots, and OverviewCard test coupling.
4. Add a lightweight structural test/helper for key workspace routes that asserts allowed surface stacks or canonical root composition. Keep it behavior-oriented: verify visible headings/regions and absence of duplicate page wrappers, not Tailwind class snapshots.
5. Add a browser checklist artifact for 375 / 1280 / 1920 and light/dark.

**Exit criteria:**

- Stale module imports are gone.
- Focused baseline is recorded.
- Test selectors used by E2E have one owner.
- No product layout has changed yet.

### Wave 1 — Chrome and shared composition contracts

**Goal:** Land reusable foundations before route-by-route flattening.

#### Wave 1A — Flat empty state and section conventions

1. Extend the existing `WorkspaceResourceListShell` empty branch so it renders heading, description, illustration, and action without Card chrome. Co-locate a small reusable fragment there only if inline consumers require it; do not add a parallel top-level empty-state primitive.
2. Clarify `Section` call sites: workspace consumers pass `variant="flat"` explicitly.
3. Consider changing `Section` default only in a separate mechanical commit after all call sites are classified; default change is optional.
4. Document the depth budget and semantic-card exception in `design-system.md`; explicitly resolve its current BrandedCard guidance so in-panel creation uses `PageShell maxWidth="narrow"` + flat sections.

#### Wave 1B — Verify and harden the existing workspace picker

1. Preserve the current root summary projection and Admin+ credit nulling.
2. Add focused tests for authorized choices, current selection, long-name truncation, and `/workspaces/:id` destinations.
3. Verify desktop/mobile parity without forcing identical markup: desktop may remain DropdownMenu while mobile stays inside the existing nav Sheet.
4. Add projection tests proving non-Admin members receive `credits: null`.
5. Refresh stale audit statements that say the picker is absent.

#### Wave 1C — Produce and consume credit events

1. Add a transaction-history event helper (or direct centralized emit) using `emitPostgresChangeEvent`.
2. Call it from `insertTransactionHistoryIdempotent` only when `inserted: true`.
3. Test event payload, workspace scope, and idempotent duplicate behavior before client changes.
4. Consolidate `$id.tsx` to one multi-table subscription for campaign + transaction history where it can revalidate both root and workspace loader consumers.
5. Remove the duplicate desktop-only Navbar subscription after desktop/mobile/sidebar parity is proven.
6. Confirm call-session local credit updates continue to consume the same event without adding another EventSource.
7. Document and verify the expected EventSource count against `docs/sse-scaling.md`.

**Exit criteria:**

- Shared flat empty state is available.
- Picker has desktop/mobile parity and no resource-ID carryover.
- Credit chrome updates through an explicit event path.
- `docs/design-system.md` describes target composition.

### Wave 2 — Highest-depth workspace journeys

**Goal:** Remove every depth 3–4 stack on primary workspace journeys.

#### Wave 2A — Onboarding

1. Preserve each active step's existing flat Section root.
2. Replace generic bordered choice/form groups with semantic fieldsets, dividers, or muted insets.
3. Keep action footer flat with one divider.
4. Ensure ProgressStrip wraps/truncates correctly at 375 and long workspace names.
5. Update unit/E2E assertions without changing onboarding persistence/actions, `_action` names, or form IDs.

**Exit:** panel → flat step; one progress strip; no duplicate padding; selector unique.

#### Wave 2B — Phone numbers

1. Replace route-local `Panel`.
2. Use PageShell heading/actions and flat sections for owned-number list, caller-ID verification, and number purchase.
3. Keep each existing number as a semantic entity Card only if multiple entities exist; otherwise use divided rows.
4. Flatten empty state.
5. Move advanced settings to existing Sheet; keep dense table inside overlay.
6. Replace raw selects on touched preset fields with canonical Select/FormField.

**Exit:** maximum depth 2; no brand Panel; existing callbacks and routing preset actions unchanged.

#### Wave 2C — Softphone/AgentDesktop

1. Remove inner `container p-6`.
2. Replace BrandedCard page wrapper with flat heading/status and one application pane.
3. Convert held/audio/incoming states to semantic Alert/insets.
4. Tokenize warning/success/destructive states.
5. Decide and remove orphan `HandsetCallPanel`.

**Exit:** maximum depth 2; connected/empty/error states covered; call behavior untouched.

#### Wave 2D — Campaign settings

1. Introduce flat section boundaries for basic, detailed, queue/readiness, and cost.
2. Move/demote CampaignSetupGuide to flat route/settings chrome.
3. Flatten CampaignCostPanel outer Card; retain metric tiles.
4. Remove `shadow-md` from resting MessageSettings shell; use Popover for tag/function menus.
5. Preserve IDs/testids used by launch/readiness E2E.

**Exit:** no Card under generic settings section; max depth 2; campaign types round-trip unchanged.

#### Wave 2E — Audience and contacts

1. Flatten audience detail tab content and uploader mapping/preview.
2. Keep one table border and one muted mapping region.
3. Flatten ContactDetails and empty ContactsPage states.
4. Replace RecentContacts elevated Cards with Accordion/divided rows.
5. Name dynamic-field icon actions and preserve contact form values.

**Exit:** max depth 2; upload/edit journeys and pagination unchanged.

### Wave 3 — Remaining workspace surfaces and interaction repairs

1. `A11Y-IVR-01`: Dialog conversion.
2. Survey builder: flat page/question hierarchy.
3. Creation routes: flat narrow PageShell replacing in-panel BrandedCard.
4. Voicemail setup: flat sections.
5. WorkspaceToday: flat action summary and work-surface typography.
6. WorkspaceResourceListShell and campaign/chat/number empty states: adopt the flattened shell-owned empty fragment.
7. Call shell alignment: Household/call header/keypad/token repairs.
8. Chat primitive/a11y migration.

**Exit criteria:**

- All workspace routes in coverage matrix are Clean or explicitly accepted semantic depth 2.
- No transparent Card remains.
- Overlay and keyboard checks pass.

### Wave 4 — Admin, public, tables, and cross-cutting polish

1. Split admin index dashboard from nested outlet routes.
2. Add admin table overflow and responsive filter stacks.
3. Flatten Twilio metric boxes into definition grids/muted regions.
4. Repair services list semantics and signup/dialog narrow widths.
5. Migrate simple custom tables; extract common queue/list infrastructure without erasing domain behavior.
6. FormFieldControl and label sweep on touched routes.
7. Semantic token/typography sweep.
8. Opportunistic Lucide migration.

**Exit criteria:**

- Admin routes work at 375/1280 and no dashboard precedes child content.
- Public/auth responsive defects are closed.
- No touched surface adds raw palette or unlabeled form controls.

### Wave 5 — Dead code, documentation, and final visual verification

1. Execute DEAD-* removals one component chain per commit.
2. Re-run route/import/test scans after each deletion.
3. Refresh `docs/design-system-audit.md` statuses and coverage matrix.
4. Run full local CI in an isolated clean worktree.
5. Execute manual browser matrix in light/dark at 375/1280/1920.

**Exit criteria:**

- KR-1 through KR-10 pass.
- Audit contains no stale file counts/findings.
- Final PR contains no unrelated user changes.

---

## 8. File touchpoint matrix

| Finding/workstream | Primary files | Tests to add/update |
|--------------------|---------------|---------------------|
| SURF-ONB-01 | onboarding Wizard/steps/strip | onboarding intro/goal/first-number + e2e |
| CHROME-WS-01 | root loader, workspace members projection, Navbar, MobileMenu | root projection RBAC + Navbar a11y/picker tests |
| CHROME-CRED-01A | transaction-history writer, workspace event emitter | inserted/duplicate emitter tests |
| CHROME-CRED-01B | workspace `$id.tsx`, Navbar subscription, mobile menu | workspace realtime revalidation + mobile parity |
| SURF-NUM-01 | settings numbers route, NumberSummaryList/Table/Purchase | number summary/list/action tests |
| SURF-PHONE-01 | AgentDesktop, SoftphonePanel and children | agent/softphone focused tests |
| SURF-CAMP-01 | CampaignSettings, SetupGuide, CostPanel, MessageSettings | launch review/readiness/orphan tests |
| SURF-AUD-01 | audience routes/uploader/history/table | audience UI + route + E2E upload |
| SURF-CON-01 | contact route/details/recent/other fields | contact value/a11y tests |
| A11Y-IVR-01 | IVR EditModal | Dialog focus/keyboard/save tests |
| HTML-PUB-01 | services route, ServiceCard | semantic list test |
| ROUTE-ADMIN-01 | admin route/index/detail layout | route rendering tests |
| SURF-EMPTY-01 | ResourceListShell + consumers | shared empty-state + route tests |
| CALL-UI-01 | call panel classes, Household, DTMF, CallContact | call screen component tests |
| CHAT-UI-01 | ChatHeader/Input/Images/ConversationList | chat input/header/image a11y tests |
| TABLE-UI-01 | DataTable, queue/audience/numbers/admin tables | list behavior + responsive wrappers |
| DEAD-* | each orphan and its test/import chain | typecheck/import/route verification |

### Boundaries that must remain intact

- Do not replace server-only workspace/Twilio/admin helpers with client projections.
- Do not loosen workspace middleware, minimum-role checks, or uniform 404 behavior.
- Do not change billing debit/idempotency paths while adding credit revalidation.
- Do not alter campaign, audience, contact, number, or call action payloads as part of visual flattening unless a separate behavior finding requires it.
- Do not move call controls out of their current Sheets/Dialogs without a call-flow review.

---

## 9. Test plan

### Focused automated checks per wave

Run the smallest relevant test set after each commit, then broaden before PR handoff:

```bash
npm run typecheck
npm run lint
npx vitest run -c vitest.ui.config.ts <focused-test-files>
npx vitest run -c vitest.node.config.ts <focused-test-files>
npm run tools:routes:verify
```

Final integration:

```bash
npm run ci:local
npm run test:e2e:compose
```

`ci:local` ends with a generated-diff cleanliness gate; run it in a clean isolated worktree or compare generated files against the captured dirty-tree baseline.

### Required focused suites

- Onboarding: progress, intro, goal, first number, validation, E2E page object.
- Navbar/root: picker projection, current workspace, mobile parity, account menu a11y.
- Workspace: skip link, realtime revalidation, Today, ResourceListShell.
- Phone numbers: summary rows, presets, advanced Sheet, action route.
- Softphone/call: AgentDesktop states, call area/header/dialogs/DTMF/Household/operator.
- Campaign: launch review, readiness, setup guide, type/orphan fields, creation goals.
- Audience/contacts: uploader, history, table, empty states, contact values and a11y.
- Admin/public: child route layout, responsive table wrappers, services list, signup width.
- Shared: Section, PageShell, empty state, Dialog behavior, FormFieldControl.

### Manual browser matrix

For each route, test light + dark at 375, 1280, and 1920+:

| Surface | Required states |
|---------|-----------------|
| Navbar | current workspace, switch, long names, mobile Sheet, Admin/member |
| Workspace Today | onboarding warning on/off; action CTA |
| Onboarding | intro + each step; long workspace name; validation |
| Numbers | empty; caller ID; rented number; custom routing; advanced Sheet |
| Handset | no number; connecting; connected; held call; audio/keypad |
| Campaign settings | message, robocall/IVR, live call; readiness errors |
| Audience | empty, upload mapping, preview, history, populated table |
| Contacts | empty, search no result, detail edit, recent activity |
| Chats | empty, populated conversation, attachment, opted-out contact |
| Call | incoming, active, household, script, disposition, zero credits |
| Survey | create/edit page and question; IVR response Dialog |
| Admin | dashboard, detail child, Twilio cards/tables |
| Public/auth | home, pricing, services, signup closed/open |

Record:

- horizontal overflow;
- clipped controls/overlays;
- visual depth and padding ownership;
- heading/landmark structure;
- focus order and Escape behavior;
- contrast and semantic status color;
- selector uniqueness.

### Regression risks

| Change | Risk | Mitigation |
|--------|------|------------|
| Flattening Cards | tests coupled to headings inside Card parts | Query visible roles/text; preserve heading levels |
| Navbar picker projection tests | accidentally broadening role/credit exposure | preserve explicit typed projection + server tests |
| Ledger event emission | duplicate events on idempotent retries | emit only when RPC returns `inserted: true`; test duplicate path |
| Ledger event delivery failure | committed credit write is surfaced as failed, encouraging unsafe retry | share a transaction if safe; otherwise keep post-write emission non-fatal and observable |
| Subscription consolidation | excess SSE/LISTEN connections or missed widget refresh | one multi-table owner; assert EventSource count and mobile/sidebar parity |
| Credit event subscription | revalidation storms or stale balance | table filter, focused event tests, browser purchase/debit smoke |
| Onboarding refactor | form ownership/submission IDs break | preserve form IDs/buttons; focused submit tests |
| Numbers layout | fetcher callbacks/action payloads drift | treat as presentational; route action tests |
| Campaign sections | readiness anchors/testids move | preserve IDs/testids; integration tests |
| Softphone flattening | Twilio state controls regress | keep behavior modules untouched; state-matrix tests |
| Table consolidation | server filters/sorts/pagination change | migrate chrome first; retain domain state adapters |
| Dead-code deletion | hidden dynamic import or route naming | import search + route verify + build |
| Admin route split | route tree or middleware changes | preserve URLs/middleware; route-tree test |

---

## 10. Repository invariants

- Preserve user-owned working-tree changes; do not reset, stash, or overwrite them.
- Do not modify `.env` or environment variables.
- Workspace route code uses scoped tenant access and existing middleware/context helpers.
- Non-members receive uniform 404; insufficient roles receive 403.
- Hidden UI is presentation, not authorization.
- Credit writes remain through canonical ledger helpers, signs, and idempotency keys.
- Twilio webhooks and call controls retain their trust boundaries.
- Keep imports at module top.
- Use exhaustive `never` checks for TypeScript unions/enums.
- Prefer existing design-system primitives and CHS packages over parallel utilities.
- Keep React Router hybrid route naming and route-tree verification intact.

---

## 11. Suggested PR and commit structure

Each PR should be independently reviewable and keep the app working.

### PR 1 — Guardrails and active contracts

1. Re-baseline the current working tree and refresh stale audit claims.
2. Flatten `WorkspaceResourceListShell` empty branch + tests.
3. Document visual depth budget and in-panel creation guidance.
4. Add behavior/RBAC tests for the existing workspace picker projection and UI.

### PR 2 — Credit event production and chrome freshness

1. Emit `transaction_history` event after a successful new ledger insert.
2. Add producer and idempotent-duplicate tests.
3. Consolidate campaign + ledger subscription at the workspace tree.
4. Remove duplicate desktop-only credit subscription after parity proof.
5. Verify existing mobile picker/credits, WorkspaceNav, and low-credit banners refresh.
6. Update realtime and Navbar tests.

### PR 3 — Onboarding flattening

One commit per step family:

1. Goal choice fieldset/insets.
2. Business basics fieldsets/insets.
3. First-number inner composition.
4. Checklist/credits/launch inner groups.
5. Progress responsive cleanup.
6. Focused/E2E updates.

### PR 4 — Phone numbers

1. Remove route-local Panel.
2. Flatten empty and side sections.
3. Preserve entity cards / advanced Sheet.
4. Migrate touched raw controls.
5. Tests and browser evidence.

### PR 5 — Softphone/call

1. Remove duplicate container padding.
2. Flatten Softphone root.
3. Convert held/audio states and tokens.
4. Align Household/DTMF/call tokens.
5. Remove HandsetCallPanel orphan.

### PR 6 — Campaign settings and creation

1. Flat settings section skeleton.
2. SetupGuide chrome.
3. CostPanel flattening.
4. MessageSettings Popover/surface cleanup.
5. Creation route PageShell migration.
6. Tests/browser evidence.

### PR 7 — Audience and contacts

1. Audience detail/tab flattening.
2. Uploader mapping/preview flattening.
3. Flat contact details.
4. Recent activity redesign.
5. Empty-state adoption and a11y tests.

### PR 8 — Remaining workspace interactions

1. IVR Dialog conversion.
2. Survey builder hierarchy.
3. Voicemail/Today/empty-state cleanup.
4. Chat primitive/a11y migration.

### PR 9 — Admin/public/table polish

1. Admin index/outlet split.
2. Admin responsive tables/filters.
3. Twilio definition-grid flattening.
4. Services/signup/public fixes.
5. Shared table chrome consolidation.

### PR 10 — Dead code and audit closeout

One small commit per confirmed orphan chain, then:

1. token/typography final sweep;
2. design-system audit refresh;
3. full CI/E2E;
4. final browser matrix evidence.

**Merge order:** PR 1 → PR 2 → PR 3/4/5 (parallel after PR 1; PR 2 before any chrome assumptions) → PR 6/7/8 → PR 9 → PR 10.

---

## 12. Coverage matrix

| Surface | Baseline | Target wave |
|---------|----------|-------------|
| Billing | OK | Preserve / regression only |
| Settings (general/API/webhook) | OK / minor | Wave 4 token/form |
| Calls log | OK | Preserve |
| Analytics | OK / test gap | Wave 5 tests |
| Campaign archive | OK | Preserve |
| Onboarding | Flat roots; inner choice/form boxes open | Wave 2A |
| Settings/numbers | Open depth 3+ | Wave 2B |
| Handset/softphone | Open depth 3–4 | Wave 2C |
| Campaign settings | Open depth 3–4 | Wave 2D |
| Audience detail/upload | Open depth 3–4 | Wave 2E |
| Contacts/detail | Open Card stack | Wave 2E |
| Workspace Today | Open Card/type | Wave 3 |
| Creation routes | Open nested BrandedCard | Wave 3 |
| Surveys | Open Card hierarchy | Wave 3 |
| Chats | Semantic panes; controls open | Wave 3 |
| Call screen | Mostly OK; shell drift | Wave 3 |
| Admin | Open route/response | Wave 4 |
| Public/auth | Mostly OK; narrow defects | Wave 4 |
| Dead/legacy components | Open | Wave 5 |

---

## 13. Out of scope

- Rebranding CallCaster or changing the visual identity.
- Replacing React Router, Tailwind, Radix, or the canonical design-system layer.
- Changing tenant authorization, billing calculation, Twilio call behavior, campaign business rules, or audience import semantics except where a verified UI contract requires it.
- Database migrations or Railway deployment changes.
- A universal rewrite of every table into DataTable in one PR.
- Removing the Result.IconMap domain exception.
- Adding a second global state system for workspace selection or credits.
- Refactoring unrelated server architecture while touching route UI.

---

## 14. Open questions and defaults

| Question | Default |
|----------|---------|
| Should credits appear in global Navbar or remain in WorkspaceNav? | Show compact Admin+ readout in Navbar when a workspace is active; keep billing navigation in WorkspaceNav until browser space review confirms consolidation |
| Should per-number cards remain? | Yes for distinct phone-number entities; flatten empty state and surrounding Panel |
| Should campaign/audience creation leave the workspace panel to keep BrandedCard? | No; keep routes in panel and use a flat narrow PageShell |
| Should Section default change from elevated to flat? | Keep API default initially; require explicit variants. Consider changing default only after call-site classification |
| Should QueueTable be replaced wholesale? | No; centralize chrome/empty/pagination first and retain specialized filtering/actions |
| Should survey questions remain Cards? | Keep one semantic question boundary using inset/divider styling, not elevated Card nesting |
| Should CampaignSetupGuide move under Navbar? | Use campaign route/settings chrome below local campaign header; avoid global Navbar ownership |
| Which credit event is canonical? | App-emitted `transaction_history` INSERT after `insertTransactionHistoryIdempotent` returns `inserted: true` |
| Must ledger and event insert be atomic? | Prefer one application transaction if the existing RPC/direct event client can share it safely; otherwise keep event emission post-write and non-fatal so UI freshness cannot convert a committed billing write into an error |
| Should dead components be deleted in the same feature PR? | Only when directly superseded and proven unused; otherwise PR 10 |

---

## 15. References

- [`docs/design-system-audit.md`](../design-system-audit.md)
- [`docs/design-system.md`](../design-system.md)
- [`AGENTS.md`](../../AGENTS.md)
- [`docs/AGENT-PLATFORM-GUIDE.md`](../AGENT-PLATFORM-GUIDE.md)
- [`docs/remediation/e2e-nitpick-followup-remediation-plan-2026-07-15.md`](./e2e-nitpick-followup-remediation-plan-2026-07-15.md)
- [`docs/remediation/critical-review-orchestration-plan-2026-07-12.md`](./critical-review-orchestration-plan-2026-07-12.md)
- [`docs/remediation/live-coaching-orchestrator-plan-2026-07-15.md`](./live-coaching-orchestrator-plan-2026-07-15.md)
- [`docs/adr/0006-no-db-side-behavior-logic.md`](../adr/0006-no-db-side-behavior-logic.md)
- [`docs/adr/0024-browser-softphone-via-twilio-voice-sdk.md`](../adr/0024-browser-softphone-via-twilio-voice-sdk.md)
- [`docs/sse-scaling.md`](../sse-scaling.md)


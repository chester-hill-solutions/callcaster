# Design System Audit (Visual Asset Ledger)

Canonical **inventory** of visual surfaces in CallCaster. Usage rules: [design-system.md](design-system.md). Component-audit method: [`.cursor/skills/component-audit/SKILL.md`](../.cursor/skills/component-audit/SKILL.md).

**Row format:** Name | Type | Source | Classes/variants | Attached to | Status

**Audit date:** 2026-07-17 (refreshed PR 10 closeout)  
**Scope:** Whole app (`app/components/**` 158 TSX; UI routes under `app/routes/**` excluding pure API leaves)  
**Evidence:** Source inventory + component-surface remediation PRs 1–10 + live IDE-browser spot-checks on `http://localhost:3001` (workspace Testing `3e021cac-…`) at 375 / 1280 / 1920, light theme. Dark theme matrix deferred to browser checklist.

---

## Executive Summary

**Verdict:** Nested surfaces + Chrome misplacement (app-wide). Local conforming pockets exist (billing flat Sections, calls log, archive campaigns, analytics flat Sections, AuthCard auth flows).

| Count | Inventory |
|------:|-----------|
| 158 | `app/components/**/*.tsx` |
| 30 | `ui/` primitives |
| 11 | `shared/` compositions |
| 101 | Non-API route TSX modules |
| 22 | Feature domains under `app/components/` |

**Implemented since prior ledger:** `Heading`/`Text`, `FormField`, `AuthCard`, `Section`/`SectionHeader`, `BrandedCard`, `PageShell`, `WorkspaceResourceListShell`, `DataTable`, single Toaster, `OnboardingProgressStrip` as route chrome, `WorkspaceToday`, `PeopleHubLayout`, `NumberSummaryList`, `BillingActivityTable`, `OperatorColumn`, regrouped `WorkspaceNav`.

**Remaining systemic problems (post-remediation):**

1. Uneven primitive adoption in low-traffic surfaces: raw `<select>`/`<table>`/`textarea` in chat/uploader pockets, dual icon libraries (`react-icons` remnants), raw palette classes vs semantic tokens in queue/TeamMember pockets.
2. ChatHeader bespoke menus and ChatImages keyboard/touch gaps (PR 8 partial).
3. Credit chrome revalidation: `transaction_history` emission landed in PR 2; continue regression coverage on purchase/debit flows.

**Resolved in component-surface remediation (PRs 1–10):** Workspace picker + credits projection; onboarding flat `Section` steps + ProgressStrip sole chrome; numbers route Panel removal + flat empty states; Softphone/AgentDesktop flattening; campaign settings/creation flat sections; audience detail tab flattening; contact detail + RecentContacts accordion; WorkspaceToday flat typography; IVR EditModal → `Dialog`; admin index/outlet split + `AdminDefinitionGrid` / `AdminTableOverflow`; public services list semantics + pricing row structure; confirmed orphan deletions (see R10).

**Resolved since prior ledger:** Navbar desktop picker + mobile workspace list; `OnboardingOverviewCard` removed; `WorkspaceResourceListShell` empty state flat; `HandsetCallPanel`, `CustomCard`, `CallScreen.TopBar`, `ContactTable`/`AudienceContactRow`, class `ErrorBoundary`, legacy campaign controls (`VoxTypeSelector`, `SelectStatus`, script question blocks, sync `ExportButton`) removed after import scan.

---

## Verdict calibration

| Verdict | Meaning |
|---------|---------|
| Clean | One surface owner, flat content, chrome in the right place |
| Minor issues | Token/typography drift, avoidable inset border, small padding duplication |
| Nested surfaces | Card-in-Card or visual depth ≥3 |
| Chrome misplacement | Persistent context (progress, credits, selection) in content cards, or chrome lacking data/revalidation |

---

## Section 1 — Static & Remote Visual Assets

### Committed (`public/`)

| Name | Type | Source | Attached to | Status |
|------|------|--------|-------------|--------|
| `Hero-1.png` | static PNG | `public/Hero-1.png` | signin, `CampaignEmptyState` via `TransparentBGImage` | canonical |
| `favicon.ico` | favicon | `public/favicon.ico` | root `<link>` | canonical |
| Tabac Slab OTF | font | `public/fonts/Tabac Slab*.otf` | `@font-face`; `font-Tabac-Slab` | canonical |
| Other font files | font | `public/fonts/*` | unwired variants | unused on disk |

### External / runtime

| Name | Type | Attached to | Status |
|------|------|-------------|--------|
| Marketing hero image | CDN PNG | `_index/index.tsx` | runtime |
| MMS / campaign media | storage URLs | chats, message settings | runtime |
| RCS logos | user URLs | onboarding / admin Twilio | runtime |

### Brand mark

| Name | Type | Source | Classes | Status |
|------|------|--------|---------|--------|
| CallCaster wordmark | typography | `Navbar.tsx` | `font-Tabac-Slab text-brand-primary` | canonical — no logo image |

---

## Section 2 — Design Tokens & Typography

### Configuration

| Name | Type | Source | Status |
|------|------|--------|--------|
| shadcn config | config | `components.json` | canonical |
| Tailwind theme | config | `tailwind.config.js` | canonical |
| CSS variables | tokens | `app/tailwind.css` | canonical |
| `cn()` | utility | `app/lib/utils.ts` | canonical |

### Typography tiers (policy)

| Use | Component |
|-----|-----------|
| Navbar wordmark | `font-Tabac-Slab text-brand-primary` |
| Button / CTA labels | `Button` (Zilla via `button.tsx`) |
| Auth / marketing hero | `AuthCard` → `Heading branded` |
| In-app page title | `Heading as="h1" level={2} branded={false}` |
| Section title | `SectionHeader branded={false}` |
| Wizard card title | `BrandedCardTitle` (standalone/creation only) |
| Body / metadata | `Text` |

### Anti-pattern register (tokens/type)

| Pattern | Example files | Replacement |
|---------|---------------|-------------|
| Raw palette (`amber-*`, `emerald-*`, `green-*`, `gray-*`, hex) | `$id.tsx` onboarding banner, `WorkspaceNav` status pills, `HeldCallsList`, `SoftphoneAudioControls`, `CallContact`, results metrics, TeamMember | semantic `success`/`warning`/`destructive` / muted |
| Slab on work surfaces | `WorkspaceToday`, `WorkspaceNav` links, call ContactStrip, many routes | `Heading`/`Text` `branded={false}`; slab on CTAs/chrome |
| `container mx-auto p-6` inside panel | Softphone/Agent empty states, campaign results | drop; panel owns padding |
| Transparent Card | `ConversationList` empty | semantic layout element |
| Ad hoc Panel (`bg-brand-secondary`) | `settings/numbers.route.tsx` | shared panel classes or flat Section |

---

## Section 3 — UI Primitives (`app/components/ui/`) — 30 files

All use `cn()` unless noted.

| Name | Type | Source | Variants / notes | Status |
|------|------|--------|------------------|--------|
| `Button` | primitive | `button.tsx` | default/destructive/outline/secondary/ghost/link; sm/default/lg/icon | canonical |
| `Input` / `Textarea` / `Label` | primitive | respective | semantic tokens | canonical |
| `Checkbox` / `Switch` | primitive | respective | Switch still has hard `#333` thumb — token fix | canonical API |
| `Select` + parts | primitive | `select.tsx` | Radix | canonical; under-adopted (uploader/chat/onboarding) |
| `FormField` / `FormFieldControl` | composition | `form-field.tsx` | a11y wiring needs `FormFieldControl` | canonical; incomplete adoption |
| `Heading` / `Text` | typography | `typography.tsx` | levels + branded | canonical; uneven adoption |
| `Card` + parts | primitive | `card.tsx` | one elevated variant | overused as page shell |
| `Table` + parts | primitive | `table.tsx` | own overflow wrapper | prefer DataTable for grids |
| `Dialog` / `Sheet` / `Popover` / `Tooltip` | overlay | respective | Radix | canonical |
| `DropdownMenu` / `Command` | overlay | respective | Radix + cmdk | ChatHeader duplicates menus |
| `Tabs` / `Accordion` | primitive | respective | Radix | canonical |
| `Alert` / `Badge` / `StatusBadge` | status | respective | success/warning/destructive | StatusBadge under-adopted in queue |
| `Progress` / `Spinner` / `Skeleton` | feedback | respective | | canonical |
| `Pagination` | primitive | `pagination.tsx` | base; lists use TablePagination | canonical |
| `Calendar` / `DateTimePicker` | composition | `calendar.tsx`, `datetime.tsx` | | canonical |
| `PageShell` | layout | `page-shell.tsx` | full/content/narrow | canonical flat wrapper |
| `CatalogPickerShell` | composition | `catalog-picker-shell.tsx` | API key / webhook pickers | canonical specialized |

**Still missing (low priority):** avatar, radio-group primitive (native radios used in creation/onboarding).

---

## Section 4 — Shared compositions (`app/components/shared/`) — 11 files

| Name | Type | Role | Status |
|------|------|------|--------|
| `AuthCard` | layout shell | centered auth | canonical |
| `Section` / `SectionHeader` | layout shell | elevated \| flat | flat = in-panel; default elevated is a nesting hazard |
| `BrandedCard*` | composition | creation wizards | canonical outside panel; reduced in-panel use post-remediation |
| `DataTable` | composition | TanStack grids | in `workspace/tables/` — canonical |
| `TablePagination` | composition | list pagination | canonical |
| `SaveBar` | ancillary | dirty/save + Cmd+S | sticky z conflict risk |
| `QueryParamBanner` | notice | URL-driven Alert | canonical |
| `InfoPopover` | ancillary | tooltip helper | add `type="button"` in forms |
| `RouteErrorBoundary` | infra | route errors | canonical — sole route error boundary |
| `ThemeProvider` / `ModeToggle` | infra | dark mode | canonical |
| `TransparentBGImage` | helper | BG image | overlay should be `pointer-events-none` / `aria-hidden` |

---

## Section 5 — Feature components by domain

~139 non-ui files. Skip `archive/`.

| Domain | Files | DS adoption | Notable gaps |
|--------|------:|-------------|--------------|
| `campaign/` | 35 | high | Flat `Section` settings; `AsyncExportButton` canonical; SetupGuide chrome |
| `call/` | 10 | high | call-panel-classes OK; token pass on Household/CallContact |
| `calls/` | 7 | high | Softphone flattened; semantic tokens on held/audio controls |
| `workspace/` | 12 | high | Today flat; ResourceListShell empty flat; Nav credits box |
| `phone-numbers/` | 11 | high | numbers route flat Sections; NumberSummaryList entity cards |
| `queue/` | 6 | medium | QueueTable ≠ DataTable; dense controls; raw palette pockets |
| `sms-ui/` | 5 | mixed | ChatHeader bespoke menus; ChatInput raw controls |
| `audience/` | 4 | high | Flat tabs + uploader; DataTable on contacts |
| `contact/` + `contacts/` | 5 | high | Flat detail; RecentContacts accordion; orphan table chain removed |
| `invite/` | 7 | medium | AuthCard OK; fields not FormField; `ErrorAlert` unused |
| `file-assets/` | 3 | high | Recorder/editor semantic panes OK |
| `layout/` | 2 | chrome | Workspace picker + credits in Navbar |
| `people/` | 1 | good | Tab rail light surface |
| `analytics/` | 1 | high | Flat Sections |
| `agent/` / `handset/` | 1+0 | high | AgentDesktop = Softphone stack; HandsetCallPanel removed |
| `question/` | 1 | high | EditModal uses `Dialog` |
| `other-services/` | 1 | high | ServiceCard `article` inside single `<li>` owner |
| `admin/` | 3 | high | `AdminDashboardPage`, `AdminDefinitionGrid`, `AdminTableOverflow` |
| Root | 0 | — | `CallScreen.TopBar` removed; `AudienceContactRow` removed |

### High-visibility components

| Name | Domain | Route / parent | Surfaces | Verdict |
|------|--------|----------------|----------|---------|
| `WorkspaceToday` | workspace | `$id` root | flat Section + `Heading branded={false}` | **Clean** (remediated) |
| `PeopleHubLayout` | people | audiences/contacts | tab `border bg-card` | Minor |
| `NumberSummaryList` | phone-numbers | settings/numbers | per-number entity card + flat empty | Clean / Minor |
| `BillingActivityTable` | workspace | billing | flat Table + muted Accordion | Clean |
| `OperatorColumn` | call | call route | layout-only | Clean |
| `CampaignSettings` | campaign | settings route | flat `Section` sections | **Clean** (remediated) |
| `CallScreen.*` | call | call route | call-panel-classes + TopChrome | Minor |
| Softphone / AgentDesktop | calls/agent | handset | flat section stack | **Clean** (remediated) |
| `ContactsPage` | contacts | contacts | DataTable; flat empty | Clean |
| `ChatHeader` / `ChatInput` | sms-ui | chats | bespoke + raw controls | Should fix |

---

## Section 6 — Route surface map

**Workspace surface owner:** [`app/routes/workspaces+/$id.tsx`](../app/routes/workspaces+/$id.tsx) — `rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6`.

**Onboarding chrome:** `OnboardingProgressStrip` mounts under Navbar when onboarding match has strip data. `OnboardingOverviewCard` removed; goal-step tests import ProgressStrip.

### Workspace child routes (panel context)

| URL area | Layout | Surface stack | Depth | Verdict |
|----------|--------|---------------|------:|---------|
| `/workspaces/:id` (Today) | panel | flat Today content | 1 | **Clean** (remediated) |
| `…/billing` | flat Sections + Alert + Accordion | panel → flat | 1 | **Clean** |
| `…/settings` | flat Sections | panel → flat | 1 | Clean / TeamMember border drift |
| `…/settings/numbers` | flat Sections + NumberSummaryList | panel → flat → entity card | 2 | **Clean** (remediated) |
| `…/audiences`, `…/contacts` | PeopleHub + list shell | panel → hub → flat list | 1–2 | Clean |
| `…/audiences/new` | PeopleHub + flat Section | panel → flat | 1–2 | **Clean** (remediated) |
| `…/audiences/:id` | Tabs + flat tables/uploader | panel → tabs → content | 2 | **Clean** (remediated) |
| `…/onboarding` | ProgressStrip + flat step Sections | strip (chrome) + panel → flat | 1–2 | **Clean** (remediated) |
| `…/campaigns/new` | flat Section + goal fieldset | panel → flat | 1–2 | **Clean** (remediated) |
| `…/campaigns/:id/settings` | CampaignSettings flat Sections | panel → flat sections | 1–2 | **Clean** (remediated) |
| `…/campaigns/:id` (home) | flat + result insets | panel → metrics/borders | 2 | Minor |
| `…/campaigns/archive` | flat list | panel → flat | 1 | Clean |
| `…/campaigns/:id/queue` | QueueTable border | panel → table pane | 2 | Minor (OK app pane) |
| `…/campaigns/:id/call` | OperatorColumn + call panels | panel → callPanelShell (2) | 2 | Minor |
| `…/calls` | Heading + DataTable | panel → flat | 1 | Clean |
| `…/handset` | AgentDesktop → Softphone | panel → flat section | 1–2 | **Clean** (remediated) |
| `…/chats` | two Chat Cards | panel → sidebar Card + thread Card | 2 | Semantic panes OK; controls open |
| `…/analytics` | flat Sections | panel → flat | 1 | Clean |
| `…/voicemails/setup` | flat Sections | panel → flat | 1 | **Clean** (remediated) |
| `…/surveys/new\|edit` | PageShell + flat Sections | panel → flat → question groups | 2 | Minor (entity hierarchy) |
| `…/scripts/new`, `…/audios/new` | flat Section | panel → flat | 1 | **Clean** (remediated) |
| `…/exports` | Table | panel → table | 1–2 | Minor |

### Standalone / auth / marketing

| URL area | Layout | Depth | Verdict |
|----------|--------|------:|---------|
| `/`, `/pricing`, `/services` | marketing | 1–2 | Clean / Minor token drift |
| `/signin`, `/signup`, `/reset*`, `/two-factor`, `/accept-invite` | AuthCard | 1 | Clean (signup fluid width remediated) |
| `/account` | PageShell + elevated Section | 1 | OK standalone |
| `/account.security` | AuthCard | 1 | Minor token drift |
| `/workspaces` index | elevated Section / empty Card | 1 | OK standalone |
| `/docs` | Scalar shell | 1 | Minor |
| `/admin/*` | index dashboard OR child outlet only | 1–2 | **Clean** (remediated outlet split) |

### Global chrome

| Surface | Source | Notes |
|---------|--------|-------|
| Navbar | `layout/Navbar.tsx` | Wordmark, Docs, workspace picker (`navbar-workspace-picker`), Admin+ credits, account, theme |
| Mobile Sheet | `Navbar.MobileMenu.tsx` | Workspace list + optional credits; user inset Card-like |
| WorkspaceNav | `WorkspaceNav.tsx` | Sibling elevated shell; Admin+ credits footer box |
| OnboardingProgressStrip | onboarding | Route chrome under Navbar — **conforming placement** |
| Credit banners | `$id.tsx` | Above panel; prefer `Alert`; raw amber on onboarding banner |
| Toaster | `root.tsx` | Single sonner root — conforming |

---

## Section 7 — Surface-combination matrix

Every distinct stacking pattern observed:

| ID | Pattern | Depth | Examples | Class |
|----|---------|------:|----------|-------|
| S0 | Panel only + flat content | 1 | billing, archive, calls log, analytics, settings flat | Conforming |
| S1 | Panel → semantic app pane (call-panel / chat Card / table border) | 2 | CallArea, QueueTable, chats panes | Conforming if semantic |
| S2 | Panel → container-only Card / BrandedCard | 2 | legacy creation pockets | **Remediated** — prefer flat Section |
| S3 | Panel → Card → bordered form groups | 3 | legacy onboarding/campaign | **Remediated** — flat fieldsets |
| S4 | Panel → Card → Card / metric tiles | 3 | legacy CostPanel/Softphone | **Remediated** except surveys entity hierarchy |
| S5 | Panel → ad hoc brand Panel → Card | 3+ | legacy numbers | **Remediated** |
| S6 | Panel → tab white shadow shell → bordered uploader | 3–4 | legacy audience detail | **Remediated** |
| S7 | Admin Card → `rounded-lg border` metric insets | 2 | Twilio panels | **Remediated** — `AdminDefinitionGrid` |
| S8 | Standalone AuthCard / elevated Section | 1 | auth, account | Conforming |
| S9 | Transparent Card | 1 smell | ConversationList empty | Should fix |
| S10 | Absolute Card “modal” | overlay smell | QuestionCard EditModal | **Remediated** → Dialog |
| S11 | ProgressStrip (chrome) + panel step Card | chrome+2 | onboarding | **Remediated** — flat steps |

---

## Section 8 — Chrome & data placement

| Concern | Current | Gap / recommendation |
|---------|---------|----------------------|
| Workspace picker | Root `listUserWorkspaceSummaries` → `{id,name,role,credits|null}`; desktop DropdownMenu + mobile list | **Implemented.** Keep root-only `/workspaces/:id` destinations; cover truncation/RBAC in tests |
| Credits in chrome | Navbar Admin+ readout + WorkspaceNav footer + ProgressStrip + layout banners | Keep server Admin+ nulling; consolidate revalidation (see credit event wave) |
| Credit revalidation | Navbar owns a credit EventSource; `$id.tsx` owns campaign; producer missing | Emit `transaction_history` from ledger write; consolidate multi-table subscription |
| Onboarding progress | ProgressStrip under Navbar | **Conforming.** OverviewCard removed; goal-step tests import ProgressStrip |
| Never hide as auth | Nav role filters are presentation | Server gates remain source of truth |

**Target chrome composition:**

```text
Navbar: wordmark | compact workspace picker | Docs | account | theme | [Admin+ credits]
Route chrome: OnboardingProgressStrip when onboarding
Workspace panel: flat step / page content only
```

---

## Section 9 — Icon inventory

| System | Approx. adoption | Status |
|--------|------------------|--------|
| **lucide-react** | majority of new UI | canonical for new code |
| **react-icons** | campaign script, chats ConversationList, signup/oauth remnants, Result.IconMap | migrate opportunistically |
| **Result.IconMap** | disposition → Md icons | documented domain exception — keep |

---

## Section 10 — Redundancy / anti-pattern register

| ID | Problem | Files | Canonical replacement |
|----|---------|-------|----------------------|
| R1 | Container Card / BrandedCard inside panel | Today, onboarding steps, creation routes, voicemail setup, Softphone | `PageShell` / `Section variant="flat"` + FormField |
| R2 | Nested bordered form groups | OnboardingBusinessBasics, CampaignSettings, MessageSettings | muted insets / fieldsets |
| R3 | Ad hoc Panel / brand chrome | numbers.route `Panel`, audience detail tab shell | shared panel classes or flat Section |
| R4 | Empty-state Card in panel | NumbersTable, NumberSummaryList, ContactsPage (ResourceListShell flattened) | adopt `WorkspaceResourceEmptyState` |
| R5 | Table strategy split | QueueTable, AudienceUploadHistory, NumbersTable, admin tables | DataTable + ui/table; specialize only filters |
| R6 | Dual icon libraries | Navbar migrated; chats/campaign remnants | lucide-react |
| R7 | Transparent / disabled Card chrome | ConversationList | `div`/`section` |
| R8 | Absolute Card as modal | Question EditModal | `Dialog` — **removed** |
| R9 | Invalid list nesting | `services.tsx` + `ServiceCard` both `<li>` | one list item owner — **fixed** |
| R10 | Orphan / inactive UI | legacy aliases and campaign controls | **removed** PR 10 |
| R11 | Admin parent always shows dashboard above Outlet | `admin+/route.tsx` | index-only dashboard — **fixed** |
| R12 | Softphone padding + Card | SoftphonePanel / AgentDesktop | flat section; drop `container p-6` |
| R13 | Campaign setup progress in content Card | CampaignSetupGuide | route chrome under Navbar / settings header strip |
| R14 | Raw controls | NumberSummaryList, ChatInput, AudienceUploader, onboarding country select | `Select` / `FormField` / `Textarea` |
| R15 | Credit SSE gap | `$id.tsx` | `transaction_history` revalidation |

---

## Section 11 — Must fix (prioritized, post-remediation)

1. **Chat primitive/a11y migration** — ChatHeader DropdownMenu parity; ChatImages keyboard/touch remove.
2. **QueueTable token pass** — semantic status tokens; optional DataTable chrome alignment.
3. **Credit event regression coverage** — purchase/debit browser smoke after PR 2 emitter.
4. **Surveys builder** — review remaining Card hierarchy for entity vs container misuse.
5. **ConversationList empty transparent Card** — replace with semantic layout element.

**Addressed in PRs 1–10:** onboarding flattening; numbers Panel removal; Softphone flattening; CampaignSettings; audience/contact detail; WorkspaceToday; IVR Dialog; admin outlet/tables; public services list; orphan deletions.

---

## Section 12 — Should fix

- Typography pass on remaining low-traffic routes: slab only on chrome/CTAs.
- Replace raw palette with semantic tokens across Nav status, TeamMember, results metrics, queue.
- Label gaps: MessageSettings textarea, admin filter inputs.
- Household → call-panel-classes; CallContact hex → tokens.
- FormFieldControl adoption so description/error ids attach to controls.
- `react-icons` → `lucide-react` opportunistically in chats/campaign remnants.

---

## Section 13 — Conforming patterns (keep)

- Workspace panel as single in-app surface owner + skip link to `#workspace-main-content`.
- Billing: flat Sections, Alert variants, Accordion rates, BillingActivityTable muted inset.
- OnboardingProgressStrip placement under Navbar.
- call-panel-classes on CallArea / QueueList / Questionnaire; OperatorColumn layout-only.
- Calls log: Heading + DataTable.
- Analytics + settings ApiKeys: `Section variant="flat"`.
- AuthCard auth flows; single root Toaster.
- PeopleHub as light tab chrome (not a page Card).
- Dialog/Sheet overlays for advanced number settings, campaign dialogs, purchase confirms.

---

## Section 14 — Test coupling

Relocate deliberately if redesigning shells:

| Selector / contract | Where |
|---------------------|-------|
| `onboarding-step` | ProgressStrip (sole owner) |
| `skipped-first-number-notice` | OnboardingWizard Alert |
| `campaign-goals` / `campaign-goal-*` | campaigns/new |
| `campaign-launch-review` / `campaign-readiness` | CampaignSettings / BasicInfo |
| `campaign-queue-table` | QueueTable |
| `call-screen-dial` / `call-screen-disposition` | CallArea; e2e CallScreenPage |
| `credits-error-banner` | CallScreen.Layout; e2e rbac/dial-modes |
| `chats-unread-badge` | WorkspaceNav |
| `audience-upload-step` / `audience-next-upload` | audiences/new |
| `api-key-*` | ApiKeysSection e2e |
| `navbar-user-menu` / `logout-button` | Navbar |
| Campaign-only revalidation | `workspace-realtime-revalidation.test.tsx` — will change with R15 |

UI test clusters: `test/ui/workspace-*`, `call-screen-*`, `number-summary-list`, `billing-activity-table`, `audience-*`, `campaign-*`, `onboarding-*`, `components-workspace-nav`, e2e under `e2e/specs/`.

---

## Section 15 — Verification appendix

### Live evidence (2026-07-17, light)

| Route | Result |
|-------|--------|
| `/workspaces/:id/onboarding?step=business_profile` | ProgressStrip + Business basics Card + nested `rounded-lg border p-4` groups; no OverviewCard in DOM source |
| Same @ 375 | No horizontal overflow; Browse Workspace Sheet pattern; strip/content readable |
| Same @ 1280 | main/panel ~949px; no overflow |
| Same @ 1920 | main/panel ~1589px; full-bleed OK |
| `/workspaces/:id/billing` | Flat Credits page + Stripe test Alert — conforming |
| `/workspaces/:id/settings/numbers` | Snapshot saw Phone numbers + empty Card + verify/purchase; intermittent error-boundary on some navigations |
| `/workspaces/:id/audiences` | Hard error page this session — **unverified live**; source audited |
| `/` | Marketing structure present; screenshot blanked once — treat as flaky capture |

### Unverified live

- Dark mode all routes
- Admin portal, chats with conversations, call screen with live Twilio, survey builder, Softphone connected state
- Authenticated ultrawide interaction beyond width metrics

### Source audit agents (this pass)

Domain inventories were produced in parallel and reconciled against live/source checks. PRs 1–10 remediation merged on `sai-flow`; PR 10 removed confirmed orphans and refreshed this ledger.

### Remediation coverage matrix (PR 10 status)

| Surface | Baseline (pre-plan) | Post-remediation | Browser matrix |
|---------|---------------------|------------------|----------------|
| Billing | OK | Preserved | to verify |
| Settings (general/API/webhook) | OK / minor | Preserved | to verify |
| Calls log | OK | Preserved | to verify |
| Analytics | OK | Preserved | to verify |
| Campaign archive | OK | Preserved | to verify |
| Onboarding | Nested Cards | **Addressed** — flat Sections + ProgressStrip | to verify |
| Settings/numbers | Depth 3+ Panel | **Addressed** — flat Sections | to verify |
| Handset/softphone | Depth 3–4 | **Addressed** — flat stack | to verify |
| Campaign settings | Depth 3–4 | **Addressed** — flat Sections | to verify |
| Audience detail/upload | Depth 3–4 | **Addressed** — flat tabs | to verify |
| Contacts/detail | Card stack | **Addressed** — flat + accordion | to verify |
| Workspace Today | Card + slab title | **Addressed** — flat typography | to verify |
| Creation routes | Nested BrandedCard | **Addressed** — flat Section | to verify |
| Surveys | Card hierarchy | Minor — entity hierarchy retained | to verify |
| Chats | Semantic panes | Partial — controls open | to verify |
| Call screen | Mostly OK | Preserved | to verify |
| Admin | Stacked outlet | **Addressed** — index/outlet split | to verify |
| Public/auth | Minor defects | **Addressed** — services list, pricing, signup width | to verify |
| Dead/legacy components | Open | **Addressed** — PR 10 deletions | N/A |

---

## Section 16 — Ordered next actions

Post-remediation follow-ups:

1. Run full browser matrix (light/dark × 375/1280/1920) — see [`docs/remediation/component-surface-browser-checklist-2026-07-17.md`](remediation/component-surface-browser-checklist-2026-07-17.md).
2. Chat primitive/a11y migration (ChatHeader, ChatImages).
3. QueueTable token pass and optional DataTable chrome alignment.
4. Credit purchase/debit browser smoke after ledger emitter.
5. Expand UI tests for analytics, audio recorder, admin tables overflow.

See [design-system.md](design-system.md) for canonical usage rules.

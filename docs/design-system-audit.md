# Design System Audit (Visual Asset Ledger)

Canonical **inventory** of visual surfaces in CallCaster. Usage rules: [design-system.md](design-system.md). Component-audit method: [`.cursor/skills/component-audit/SKILL.md`](../.cursor/skills/component-audit/SKILL.md).

**Row format:** Name | Type | Source | Classes/variants | Attached to | Status

**Audit date:** 2026-07-17  
**Scope:** Whole app (`app/components/**` 169 TSX; UI routes under `app/routes/**` excluding pure API leaves)  
**Evidence:** Source inventory + parallel domain audits + live IDE-browser spot-checks on `http://localhost:3001` (workspace Testing `3e021cac-…`) at 375 / 1280 / 1920, light theme. Dark theme not live-verified this pass.

---

## Executive Summary

**Verdict:** Nested surfaces + Chrome misplacement (app-wide). Local conforming pockets exist (billing flat Sections, calls log, archive campaigns, analytics flat Sections, AuthCard auth flows).

| Count | Inventory |
|------:|-----------|
| 169 | `app/components/**/*.tsx` |
| 30 | `ui/` primitives |
| 13 | `shared/` compositions |
| 101 | Non-API route TSX modules |
| 22 | Feature domains under `app/components/` |

**Implemented since prior ledger:** `Heading`/`Text`, `FormField`, `AuthCard`, `Section`/`SectionHeader`, `BrandedCard`, `PageShell`, `WorkspaceResourceListShell`, `DataTable`, single Toaster, `OnboardingProgressStrip` as route chrome, `WorkspaceToday`, `PeopleHubLayout`, `NumberSummaryList`, `BillingActivityTable`, `OperatorColumn`, regrouped `WorkspaceNav`.

**Remaining systemic problems:**

1. Workspace panel is the surface owner, but many child routes still mount `Card` / `BrandedCard` / ad hoc bordered shells as page containers (depth ≥3 common).
2. Credit chrome revalidation is incomplete: Navbar and call-session subscribe to `transaction_history`, but ledger writes do not yet emit those events; mobile/sidebar/banner parity still needs consolidation.
3. Uneven primitive adoption: raw `<select>`/`<table>`/`textarea`, dual icon libraries, raw palette classes vs semantic tokens.
4. Several inactive/orphan components remain unused in production.

**Resolved since prior ledger:** Navbar desktop picker + mobile workspace list (Admin+-gated credits projection); `OnboardingOverviewCard` removed and ProgressStrip is the sole progress surface; `WorkspaceResourceListShell` empty state is flat (no Card).

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

## Section 4 — Shared compositions (`app/components/shared/`) — 13 files

| Name | Type | Role | Status |
|------|------|------|--------|
| `AuthCard` | layout shell | centered auth | canonical |
| `Section` / `SectionHeader` | layout shell | elevated \| flat | flat = in-panel; default elevated is a nesting hazard |
| `BrandedCard*` | composition | creation wizards | canonical outside panel; over-adopted inside panel |
| `CustomCard` | alias | re-exports BrandedCard | **inactive** — no production imports; deletion candidate |
| `DataTable` | composition | TanStack grids | in `workspace/tables/` — canonical |
| `TablePagination` | composition | list pagination | canonical |
| `SaveBar` | ancillary | dirty/save + Cmd+S | sticky z conflict risk |
| `QueryParamBanner` | notice | URL-driven Alert | canonical |
| `InfoPopover` | ancillary | tooltip helper | add `type="button"` in forms |
| `RouteErrorBoundary` | infra | route errors | canonical |
| `ErrorBoundary` | infra | class boundary | **inactive** legacy; hard palette |
| `ThemeProvider` / `ModeToggle` | infra | dark mode | canonical |
| `TransparentBGImage` | helper | BG image | overlay should be `pointer-events-none` / `aria-hidden` |

---

## Section 5 — Feature components by domain

~139 non-ui files. Skip `archive/`.

| Domain | Files | DS adoption | Notable gaps |
|--------|------:|-------------|--------------|
| `campaign/` | 41 | mixed | Settings Card stacks; SetupGuide; CostPanel; MessageSettings shadow-md |
| `call/` | 10 | medium-high | call-panel-classes OK; Household ad-hoc; CallContact hex |
| `calls/` | 7 | low | Softphone BrandedCard depth 3–4; raw palette |
| `workspace/` | 12 | high / mixed | Today Card; ResourceListShell empty Card; Nav credits box |
| `phone-numbers/` | 11 | medium | NumberSummaryList Cards; numbers Panel shell; raw selects |
| `queue/` | 6 | medium | QueueTable ≠ DataTable; dense controls; raw palette |
| `sms-ui/` | 5 | mixed | ChatHeader bespoke menus; ChatInput raw controls |
| `audience/` | 4 | medium | Nested tab shells + bordered uploader |
| `contact/` + `contacts/` | 7 | medium | ContactDetails Card + RecentContacts Cards; empty Cards |
| `invite/` | 7 | medium | AuthCard OK; fields not FormField; `ErrorAlert` unused |
| `file-assets/` | 3 | high | Recorder/editor semantic panes OK |
| `layout/` | 2 | chrome | No workspace picker; workspaces unused |
| `people/` | 1 | good | Tab rail light surface |
| `analytics/` | 1 | high | Flat Sections |
| `agent/` / `handset/` | 1+1 | low | AgentDesktop = Softphone stack; HandsetCallPanel **orphan** |
| `question/` | 1 | low | EditModal absolute Card ≠ Dialog |
| `other-services/` | 1 | low | ServiceCard returns `<li>` → nested lists |
| Root | 3 | legacy | `CallScreen.TopBar` inactive; `AudienceContactRow` only via inactive ContactTable; `MessageSettings.tsx` root vs campaign path |

### High-visibility components

| Name | Domain | Route / parent | Surfaces | Verdict |
|------|--------|----------------|----------|---------|
| `WorkspaceToday` | workspace | `$id` root | Card + Tabac h1 | Nested + type |
| `PeopleHubLayout` | people | audiences/contacts | tab `border bg-card` | Minor |
| `NumberSummaryList` | phone-numbers | settings/numbers | per-number Card + inset form | Nested (entity OK; empty Card not) |
| `BillingActivityTable` | workspace | billing | flat Table + muted Accordion | Clean |
| `OperatorColumn` | call | call route | layout-only | Clean |
| `CampaignSettings` | campaign | settings route | bordered sections + nested Cards | Nested |
| `CallScreen.*` | call | call route | call-panel-classes + TopChrome | Minor / Nested softphone sibling |
| Softphone / AgentDesktop | calls/agent | handset | BrandedCard stack | Nested depth 3–4 |
| `ContactsPage` | contacts | contacts | DataTable; empty Cards | Minor / Nested empty |
| `ChatHeader` / `ChatInput` | sms-ui | chats | bespoke + raw controls | Should fix |

---

## Section 6 — Route surface map

**Workspace surface owner:** [`app/routes/workspaces+/$id.tsx`](../app/routes/workspaces+/$id.tsx) — `rounded-2xl border border-border/80 bg-card/70 p-4 shadow-sm sm:p-6`.

**Onboarding chrome:** `OnboardingProgressStrip` mounts under Navbar when onboarding match has strip data. `OnboardingOverviewCard` removed; goal-step tests import ProgressStrip.

### Workspace child routes (panel context)

| URL area | Layout | Surface stack | Depth | Verdict |
|----------|--------|---------------|------:|---------|
| `/workspaces/:id` (Today) | panel | WorkspaceToday Card | 2 | Nested + slab title |
| `…/billing` | flat Sections + Alert + Accordion | panel → flat | 1 | **Clean** (live OK) |
| `…/settings` | flat Sections | panel → flat | 1 | Clean / TeamMember border drift |
| `…/settings/numbers` | ad hoc `Panel` + NumberSummaryList Cards | panel → brand Panel → Card | 3+ | Nested + ad hoc shell |
| `…/audiences`, `…/contacts` | PeopleHub + list shell | panel → hub → (empty Card) | 2 | Minor / Nested empty |
| `…/audiences/new` | PeopleHub + BrandedCard | panel → BrandedCard | 2–3 | Nested |
| `…/audiences/:id` | Tabs + white shadow shell | panel → tab shell → uploader borders | 3–4 | Nested |
| `…/onboarding` | ProgressStrip + step Card | strip (chrome) + panel → Card → `rounded-lg border p-4` groups | 3 | Nested (live confirmed) |
| `…/campaigns/new` | BrandedCard + goal borders | panel → BrandedCard → choices | 3 | Nested |
| `…/campaigns/:id/settings` | CampaignSettings tree | panel → bordered sections → Cards/insets | 3–4 | Nested |
| `…/campaigns/:id` (home) | flat + result insets | panel → metrics/borders | 2–3 | Minor / Nested |
| `…/campaigns/archive` | flat list | panel → flat | 1 | Clean |
| `…/campaigns/:id/queue` | QueueTable border | panel → table pane | 2 | Minor (OK app pane) |
| `…/campaigns/:id/call` | OperatorColumn + call panels | panel → callPanelShell (2); Softphone N/A | 2 | Minor |
| `…/calls` | Heading + DataTable | panel → flat | 1 | Clean |
| `…/handset` | AgentDesktop → Softphone | panel → BrandedCard → nested | 3–4 | Nested |
| `…/chats` | two Chat Cards | panel → sidebar Card + thread Card | 2 | Semantic panes OK; empty transparent Card smell |
| `…/analytics` | flat Sections | panel → flat | 1 | Clean |
| `…/voicemails/setup` | PageShell + Cards | panel → Cards | 2–3 | Nested |
| `…/surveys/new\|edit` | PageShell + Card → question Cards | panel → Card → Card | 3 | Nested (entity hierarchy — flag) |
| `…/scripts/new`, `…/audios/new` | BrandedCard | panel → BrandedCard | 2 | Nested / creation smell |
| `…/exports` | Table | panel → table | 1–2 | Minor |

### Standalone / auth / marketing

| URL area | Layout | Depth | Verdict |
|----------|--------|------:|---------|
| `/`, `/pricing`, `/services` | marketing | 1–2 | Minor; pricing rate-in-card; services nested `<li>` |
| `/signin`, `/signup`, `/reset*`, `/two-factor`, `/accept-invite` | AuthCard | 1 | Clean (signup `min-w-[400px]` closed state breaks 375) |
| `/account` | PageShell + elevated Section | 1 | OK standalone |
| `/account.security` | AuthCard | 1 | Minor token drift |
| `/workspaces` index | elevated Section / empty Card | 1 | OK standalone |
| `/docs` | Scalar shell | 1 | Minor |
| `/admin/*` | admin shell Cards | 1–2 | Nested insets in Twilio; parent always renders dashboard above Outlet |

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
| S2 | Panel → container-only Card / BrandedCard | 2 | WorkspaceToday, creation routes, onboarding steps | **Must fix** |
| S3 | Panel → Card → bordered form groups | 3 | OnboardingBusinessBasics, CampaignSettings sections | **Must fix** |
| S4 | Panel → Card → Card / metric tiles | 3 | CampaignCostPanel, surveys page→question, Softphone→HeldCalls rows | **Must fix** (except documented entity hierarchies) |
| S5 | Panel → ad hoc brand Panel → Card | 3+ | settings/numbers | **Must fix** |
| S6 | Panel → tab white shadow shell → bordered uploader | 3–4 | audience detail | **Must fix** |
| S7 | Admin Card → `rounded-lg border` metric insets | 2 | Twilio panels | Should fix |
| S8 | Standalone AuthCard / elevated Section | 1 | auth, account | Conforming |
| S9 | Transparent Card | 1 smell | ConversationList empty | Should fix |
| S10 | Absolute Card “modal” | overlay smell | QuestionCard EditModal | **Must fix** → Dialog |
| S11 | ProgressStrip (chrome) + panel step Card | chrome+2 | onboarding live | Strip OK; flatten step |

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
| R8 | Absolute Card as modal | Question EditModal | `Dialog` |
| R9 | Invalid list nesting | `services.tsx` + `ServiceCard` both `<li>` | one list item owner |
| R10 | Orphan / inactive UI | `HandsetCallPanel`, `CallScreen.TopBar`, `ContactTable` chain, `CustomCard`, `ErrorBoundary` | delete after import scan |
| R11 | Admin parent always shows dashboard above Outlet | `admin+/route.tsx` | index-only dashboard; child routes without stacked shell |
| R12 | Softphone padding + Card | SoftphonePanel / AgentDesktop | flat section; drop `container p-6` |
| R13 | Campaign setup progress in content Card | CampaignSetupGuide | route chrome under Navbar / settings header strip |
| R14 | Raw controls | NumberSummaryList, ChatInput, AudienceUploader, onboarding country select | `Select` / `FormField` / `Textarea` |
| R15 | Credit SSE gap | `$id.tsx` | `transaction_history` revalidation |

---

## Section 11 — Must fix (prioritized)

1. **Flatten onboarding step Cards** — ProgressStrip stays; steps → flat Section + muted insets (`OnboardingBusinessBasicsStep` et al.). Live depth 3 confirmed.
2. **settings/numbers** — remove brand `Panel`; NumberSummaryList empty → flat; keep per-number entity cards at depth 2 max.
3. **Softphone / AgentDesktop** — remove BrandedCard + `container p-6`; token-fix HeldCallsList / SoftphoneAudioControls.
4. **CampaignSettings** — flat sections; demote SetupGuide to chrome; flatten CostPanel outer Card.
5. **Audience detail / uploader** — flatten tab shells; one bordered table max.
6. **ContactDetails + RecentContacts** — flat detail; restrain attempt elevation.
7. **Credit event production + chrome revalidation consolidation** (picker already landed).
8. **Question EditModal → Dialog; services list semantics.**

---

## Section 12 — Should fix

- Typography pass: slab only on chrome/CTAs; page titles `Heading branded={false}`.
- Replace raw palette with semantic tokens across Nav status, TeamMember, results metrics, queue, chat banners.
- Label gaps: SelectNumber, SelectType, MessageSettings textarea, admin filter inputs.
- ChatHeader: drop bespoke menus for DropdownMenu; ChatImages keyboard/touch remove.
- Household → call-panel-classes; CallContact hex → tokens.
- Decide fate of orphan HandsetCallPanel / TopBar / ContactTable.
- Admin Twilio: definition grids instead of bordered metric boxes; overflow wrappers on tables.
- Signup closed-state `min-w-[400px]` → fluid width.
- FormFieldControl adoption so description/error ids attach to controls.

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

Domain inventories were produced in parallel and reconciled against live/source checks (notably: OverviewCard absent; ProgressStrip present; billing conforming).

---

## Section 16 — Ordered next actions

No code changes in this audit task. Suggested implementation sequence:

1. Keep ProgressStrip as sole `onboarding-step` owner; flatten inner onboarding groups.
2. Flatten onboarding steps + CampaignSettings + Softphone (largest depth defects).
3. numbers route: kill ad hoc Panel; flatten empty states.
4. Navbar picker + `transaction_history` layout revalidation.
5. Audience/contact nesting + EditModal Dialog + services `<li>` fix.
6. Token/typography sweep on touched files; lucide opportunistically.
7. Delete confirmed orphans (CustomCard, HandsetCallPanel, TopBar, inactive ErrorBoundary) after import greps.
8. Expand UI tests for analytics, audio recorder, ChatImages a11y, admin tables overflow.

See [design-system.md](design-system.md) for canonical usage rules.

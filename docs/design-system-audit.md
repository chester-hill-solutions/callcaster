# Design System Audit (Visual Asset Ledger)

Canonical **inventory** of visual surfaces in Callcaster. For usage rules, see [design-system.md](design-system.md).

**Row format** (used throughout): Name | Type | Source | Classes/variants | Attached to | Status

---

## Executive Summary

The repo has a solid primitive layer in [`app/components/ui/`](app/components/ui/) (27 files), composition components in [`app/components/shared/`](app/components/shared/), and tokenized theme foundations in [`app/tailwind.css`](app/tailwind.css) and [`tailwind.config.js`](tailwind.config.js).

**Implemented since the original audit:**

| Capability | Source | Status |
|------------|--------|--------|
| `Heading` / `Text` | [`typography.tsx`](app/components/ui/typography.tsx) | canonical |
| `FormField` | [`form-field.tsx`](app/components/ui/form-field.tsx) | canonical |
| `AuthCard` | [`AuthCard.tsx`](app/components/shared/AuthCard.tsx) | canonical (signin, signup, reset) |
| `Section` / `SectionHeader` | [`Section.tsx`](app/components/shared/Section.tsx) | canonical |
| `BrandedCard*` | [`BrandedCard.tsx`](app/components/shared/BrandedCard.tsx) | canonical (wraps `ui/card` + `Heading`) |
| `Skeleton` | [`skeleton.tsx`](app/components/ui/skeleton.tsx) | canonical; used by DataTable |
| Single `<Toaster />` | [`root.tsx`](app/root.tsx) L109 | canonical |
| `forms/Inputs` in production | — | **dead code** (test-only via re-export) |

**Remaining problem:** uneven adoption — creation routes, list shells, raw tables, dual icon libraries, and ad hoc Tailwind bypass the components above.

---

## Section 1 — Static & Remote Visual Assets

### Committed (`public/`)

| Name | Type | Source | Attached to | Status |
|------|------|--------|-------------|--------|
| `Hero-1.png` | static PNG | `public/Hero-1.png` | [`signin.tsx`](app/routes/signin.tsx), [`CampaignEmptyState.tsx`](app/components/campaign/CampaignEmptyState.tsx) via [`TransparentBGImage.tsx`](app/components/shared/TransparentBGImage.tsx) | canonical |
| `favicon.ico` | favicon | `public/favicon.ico` | implicit `/favicon.ico` | canonical (explicit `<link>` added in root) |
| Tabac Slab OTF (3 faces) | font | `public/fonts/Tabac Slab*.otf` | `@font-face` in tailwind.css; `font-Tabac-Slab` | canonical |
| Other font files (~34) | font | `public/fonts/*` | unwired variants (Big Slab weights, etc.) | unused on disk |

### External / runtime (not in repo)

| Name | Type | Attached to | Status |
|------|------|-------------|--------|
| `person-calling.png` | CDN PNG | [`_index/index.tsx`](app/routes/_index/index.tsx) (Supabase storage) | runtime |
| MMS / campaign media | storage URLs | [`ChatMessages.tsx`](app/components/sms-ui/ChatMessages.tsx), [`MessageSettings.tsx`](app/components/campaign/settings/MessageSettings.tsx) | runtime |
| RCS logos | user URLs | onboarding / admin Twilio panels | runtime |

### Brand mark

| Name | Type | Source | Classes | Status |
|------|------|--------|---------|--------|
| CallCaster wordmark | typography | [`Navbar.tsx`](app/components/layout/Navbar.tsx) | `font-Tabac-Slab text-brand-primary` | canonical — no logo image file |

---

## Section 2 — Design Tokens & Typography

### Configuration

| Name | Type | Source | Status |
|------|------|--------|--------|
| shadcn config | config | [`components.json`](components.json) | canonical |
| Tailwind theme | config | [`tailwind.config.js`](tailwind.config.js) | canonical |
| CSS variables | tokens | [`app/tailwind.css`](app/tailwind.css) | canonical |
| `cn()` | utility | [`app/lib/utils.ts`](app/lib/utils.ts) | canonical |
| `handleNavlinkStyles()` | utility | [`app/lib/utils.ts`](app/lib/utils.ts) | canonical nav styling |

### Semantic tokens

`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`, `--card`, `--destructive`, etc.

### Brand tokens

`--brand-primary`, `--brand-secondary`, `--brand-tertiary`, `--brand-bronze`, `--brand-silver`, `--brand-gold`

### Font families

| Name | Tailwind class | Source | Usage | Status |
|------|----------------|--------|-------|--------|
| Zilla Slab | `font-Zilla-Slab` | Google Fonts via root | ~50+ files | **primary brand type** |
| Tabac Slab | `font-Tabac-Slab` | local OTF | Navbar, wordmark | canonical |
| Tabac Big Slab | `font-Tabac-Big-Slab` | local OTF | 0 | removed from CSS |
| Josefin Sans | `font-Josefin-Sans` | local TTF | 0 | removed from CSS |
| Lilita One | `font-Lilita-One` | local TTF | 0 | removed from CSS |
| Sarabun | `font-Sarabun` | local TTF (16 files) | 0 | removed from CSS |

### Anti-pattern register

| Pattern | Files (sample) | Canonical replacement |
|---------|----------------|----------------------|
| `border-gray-300` | creation routes, survey responses, contact forms | `border-border` + `Input`/`Select` |
| `dark:bg-zinc-800` | creation routes | `bg-background` / `Input` |
| Hex literals | [`pricing.tsx`](app/routes/pricing.tsx) | semantic brand/primary tokens |
| Inline hex | [`CallScreen.CallArea.tsx`](app/components/call/CallScreen.CallArea.tsx) | CSS variables or semantic tokens |
| Raw `font-Zilla-Slab text-*` on routes | list pages, auth links | `Heading` / `Text` with `branded` |

---

## Section 3 — UI Primitives (`app/components/ui/`)

27 files. All use `cn()` from `@/lib/utils` unless noted.

| Name | Type | Source | Basis / variants | Status |
|------|------|--------|------------------|--------|
| `Button`, `buttonVariants` | primitive | `button.tsx` | Radix Slot + cva: default, destructive, outline, secondary, ghost, link; sizes sm/default/lg/icon | canonical |
| `Input` | primitive | `input.tsx` | native input + semantic tokens | canonical |
| `Textarea` | primitive | `textarea.tsx` | native textarea | canonical |
| `Label`, `labelVariants` | primitive | `label.tsx` | Radix Label + cva | canonical |
| `Checkbox` | primitive | `checkbox.tsx` | Radix + Lucide Check | canonical |
| `Switch` | primitive | `switch.tsx` | Radix | canonical |
| `Select` + subcomponents | primitive | `select.tsx` | Radix + Lucide | canonical |
| `FormField` | composition | `form-field.tsx` | label + description + error wrapper | canonical |
| `Heading`, `Text` | typography | `typography.tsx` | cva levels + `branded` | canonical |
| `Card` + subcomponents | primitive | `card.tsx` | plain divs | canonical |
| `Table` + subcomponents | primitive | `table.tsx` | plain table elements | canonical |
| `Dialog`, `Sheet`, `Popover`, `Tooltip` | primitive | respective files | Radix | canonical |
| `DropdownMenu`, `Command` | primitive | respective files | Radix + cmdk | canonical |
| `Tabs`, `Accordion` | primitive | respective files | Radix | canonical |
| `Alert`, `Badge` | primitive | respective files | cva variants | canonical |
| `Progress`, `Spinner`, `Skeleton` | primitive | respective files | Radix / custom / pulse | canonical |
| `Pagination` + subcomponents | primitive | `pagination.tsx` | Lucide chevrons | canonical |
| `Calendar` | primitive | `calendar.tsx` | react-day-picker + buttonVariants | canonical |
| `DateTimePicker`, `TimePicker` | composition | `datetime.tsx` | calendar + select + input | canonical |

**Route adoption:** ~70 route files import `@/components/ui/*`. Most-used: `Button`, `FormField`, `Input`, `Card`, `Table`.

**Still missing (low priority):** avatar, radio group.

---

## Section 4 — Composition & Layout Components

| Name | Type | Source | Role | Status |
|------|------|--------|------|--------|
| `AuthCard` | layout shell | `shared/AuthCard.tsx` | centered auth card | canonical |
| `Section`, `SectionHeader` | layout shell | `shared/Section.tsx` | settings / creation blocks | canonical |
| `BrandedCard*` | composition | `shared/BrandedCard.tsx` | branded card on `ui/card` | canonical |
| `CustomCard` exports | alias | `shared/CustomCard.tsx` | re-exports BrandedCard as `Card`, `CardTitle`, … | legacy import path |
| `DataTable` | composition | `workspace/tables/DataTable.tsx` | TanStack + skeleton, toolbar, pagination | canonical |
| `TablePagination` | composition | `shared/TablePagination.tsx` | pagination UI | canonical |
| `QueueTablePagination` | composition | `queue/QueueTablePagination.tsx` | thin wrapper over TablePagination | OK |
| `WorkspaceResourceListShell` | layout shell | `workspace/WorkspaceResourceListShell.tsx` | list page header + error + empty | canonical |
| `ContactsPage` | page | `contacts/ContactsPage.tsx` | richest list pattern (search, pagination) | canonical |
| `workspacePanelHeight*Class` | token | `workspace-panel-classes.ts` | panel height constants | canonical |
| `Navbar`, `NavbarMobileMenu` | layout | `layout/` | app chrome | canonical |
| `WorkspaceNav` | layout | `workspace/WorkspaceNav.tsx` | workspace sidebar | canonical |
| `ThemeProvider`, `ModeToggle` | infra | `shared/` | dark mode | canonical |
| `SaveBar`, `InfoPopover`, `QueryParamBanner` | composition | `shared/` | ancillary UI | canonical |
| `TransparentBGImage` | static helper | `shared/TransparentBGImage.tsx` | background image wrapper | canonical |
| `ErrorBoundary`, `RouteErrorBoundary` | infra | `shared/` | error UI | canonical |

### Legacy alias note

`CustomCard` is **not** a third card system — it re-exports `BrandedCard`. Migrate imports to `BrandedCard` directly.

---

## Section 5 — Feature Components by Domain

~155 files under `app/components/` (excluding `ui/`). Skip `archive/`.

| Domain | ~Files | DS adoption | Notable gaps |
|--------|--------|-------------|--------------|
| `campaign/` | 36 | mixed | script builder, settings, results |
| `call/`, `calls/` | 17 | low | inline hex in CallArea |
| `workspace/` | 8 | high | — |
| `sms-ui/` | 6 | mixed | ChatHeader bespoke menus |
| `phone-numbers/` | 10 | medium | NumbersTable raw `<table>` |
| `queue/`, `audience/`, `contact/` | 17 | medium-high | — |
| `script/` | 6 | medium | — |
| Root duplicates | 10 | legacy | QuestionCard.* vs nested campaign copies |

### High-visibility components

| Name | Domain | Route / parent | Uses ui/* + FormField? |
|------|--------|----------------|------------------------|
| `CampaignSettings` | campaign | campaign settings route | partial |
| `CampaignHomeScreen` | campaign | campaign home | partial |
| `CallScreen.*` | call | call route | low |
| `SoftphonePanel` | calls | calls route | CustomCard import |
| `NumbersTable` | phone-numbers | settings/numbers | raw table |
| `QueueTable` | queue | queue route | DataTable-like custom |
| `ContactsPage` | contact | contacts route | high |
| `ChatMessages`, `ChatHeader` | sms-ui | chats route | mixed |

### Dead code (removed)

| Name | Source | Status |
|------|--------|--------|
| `forms/Inputs` exports | `forms/Inputs.tsx` | deleted — was test-only |
| Root `Icons.tsx` | `components/Icons.tsx` | deleted |
| `shared/Icons.tsx` | `shared/Icons.tsx` | deleted — unused in production |

Feature-specific `forms/` components remain: `AudioSelector`, `InputSelector`, `OutputSelector`.

---

## Section 6 — Icon Inventory

| System | File count | Status |
|--------|------------|--------|
| **lucide-react** | 65 app files | **canonical for new code** |
| **react-icons** (md, fa, fc) | 41 app files | legacy — migrate opportunistically |
| **Result.IconMap** | 1 map file, 45 Md names | domain exception — keep |

### lucide-react (sample exports by area)

Primitives: `Check`, `ChevronDown`, `X`, `Calendar` icons in `ui/*`. Features: `Search`, `Trash2`, `ArrowUp`, `Plus` in admin, campaign, queue, contacts.

### react-icons (sample)

`MdEdit`, `MdAdd`, `MdDialpad` in campaign script, workspace nav, signup OAuth, contacts table.

### Domain exception

[`Result.IconMap.tsx`](app/components/call-list/records/participant/Result.IconMap.tsx) maps call disposition names to Material Design icons for script options — intentional exception documented in design-system.md.

---

## Section 7 — UI Route Surface Map & Redundancy Register

**Scope:** UI routes from [`route-tree.txt`](scripts/baselines/route-tree.txt), excluding `api/*` leaves.

### Surface map (representative)

| URL area | Layout | ui/* | Card | Table | Feedback | Notes |
|----------|--------|------|------|-------|----------|-------|
| `/signin`, `/signup`, `/reset-password` | AuthCard | yes | ui/card via AuthCard | — | useActionFeedback | canonical auth |
| `/accept-invite` | AuthCard | partial | AuthCard | — | useActionFeedback | migrated |
| `/workspaces` | Section | yes | ui/card | — | toast | workspace index |
| `…/audiences`, `…/audios`, `…/scripts`, `…/voicemails` | list shell | yes | — | DataTable | inline error | WorkspaceResourceListShell |
| `…/contacts` | ContactsPage | yes | panel | DataTable | inline error | canonical list |
| `…/campaigns/new`, `…/scripts/new`, etc. | BrandedCard | partial | BrandedCard | — | inline | FormField migration |
| `…/billing` | panel | partial | ui/card | raw `<table>` | URL banner | Phase E |
| `…/surveys/…/responses` | panel | yes | ui/card | raw `<table>` | mixed | Phase E |
| `…/settings/numbers` | Section | yes | — | NumbersTable raw | — | Phase E |
| `/admin/*` | panel | yes | ui/card | manual ui/table | toast | evaluate DataTable |
| `/pricing` | marketing | no | ad hoc | — | — | hex literals |

### Redundancy register

| ID | Problem | Files | Canonical replacement |
|----|---------|-------|----------------------|
| R1 | Duplicated raw input class | `campaigns/new`, `scripts/new`, `audiences/new`, `audios/new`, campaign audiences new | `FormField` + `Input`/`Select` inside `BrandedCard` |
| R2 | List page shell duplicated | audiences, audios, scripts, voicemails routes | `WorkspaceResourceListShell` |
| R3 | Ad hoc auth layout | accept-invite | `AuthCard` |
| R4 | Table strategy split | billing, survey responses, NumbersTable | `DataTable` + `ui/table` |
| R5 | Dual icon libraries | Navbar, campaign script, signup | lucide-react (keep Result.IconMap) |
| R6 | Dead code | forms/Inputs, Icons.tsx | removed |
| R7 | Unused font registrations | tailwind.css (Josefin, Lilita, Sarabun, Big Slab) | deregistered |
| R8 | Inline hex colors | CallScreen.CallArea | semantic tokens |
| R9 | CustomCard import paths | 8 production files | `BrandedCard` direct imports |
| R10 | Inline error headings | list routes, billing | `useActionFeedback` + `ui/alert` / `Text destructive` |

---

## Root Causes

1. Migration from legacy patterns stopped mid-way — composition exists but routes weren't updated.
2. List/table patterns were copy-pasted per feature instead of extracting from ContactsPage / DataTable.
3. Brand styling remains in route class strings instead of Heading/Text/components.
4. Base CSS styles native inputs, reducing pressure to use `Input`.

---

## Recommended Implementation Sequence

1. ~~Refresh this audit (ledger PR)~~ — done
2. Phase A: dead code, fonts, favicon, accept-invite AuthCard
3. Phase B: WorkspaceResourceListShell + creation route FormField migration
4. Phase C: semantic tokens, BrandedCard imports, feedback standardization
5. Phase D: lucide migration in nav/campaign hot paths
6. Phase E: billing, survey responses, NumbersTable → DataTable pattern

See [design-system.md](design-system.md) for canonical usage rules.

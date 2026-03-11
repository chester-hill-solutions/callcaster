# Design System Audit

This audit consolidates the current design-system surface in `callcaster`, identifies missing or duplicated component capabilities, and calls out the highest-value implementation gaps where feature code bypasses the shared system.

## Executive Summary

The repo already has a solid primitive layer in [`app/components/ui/`](app/components/ui/) and tokenized theme foundations in [`app/tailwind.css`](app/tailwind.css) and [`tailwind.config.js`](tailwind.config.js). The main issue is not a lack of building blocks; it is that the codebase is split across three parallel systems:

- `ui/*` for newer shared primitives
- `shared/CustomCard` for older branded shells
- `forms/Inputs` plus raw HTML controls for older forms

That leaves the app with inconsistent typography, repeated form markup, multiple table and pagination patterns, and route-level custom styling that bypasses the components that already exist.

## 1. Consolidated Component Inventory

### Foundation and Configuration

- [`components.json`](components.json): shadcn configuration, CSS variables enabled, aliases for `@/components` and `@/lib/utils`.
- [`tailwind.config.js`](tailwind.config.js): container defaults, font families, semantic color aliases, shared radius tokens, animation utilities.
- [`app/tailwind.css`](app/tailwind.css): brand tokens, semantic tokens, font-face declarations, dark-mode variables, and a base rule that styles raw `input`, `select`, and `textarea`.
- [`app/lib/utils.ts`](app/lib/utils.ts): shared `cn()` class merge utility.

### Canonical Primitives in `app/components/ui`

| Area | Components | Notes |
| --- | --- | --- |
| Actions | [`button.tsx`](app/components/ui/button.tsx) | `cva` variants, sizes, `asChild` support |
| Form controls | [`input.tsx`](app/components/ui/input.tsx), [`textarea.tsx`](app/components/ui/textarea.tsx), [`label.tsx`](app/components/ui/label.tsx), [`checkbox.tsx`](app/components/ui/checkbox.tsx), [`switch.tsx`](app/components/ui/switch.tsx), [`select.tsx`](app/components/ui/select.tsx) | Strong primitive base for most form needs |
| Overlays | [`dialog.tsx`](app/components/ui/dialog.tsx), [`sheet.tsx`](app/components/ui/sheet.tsx), [`popover.tsx`](app/components/ui/popover.tsx), [`tooltip.tsx`](app/components/ui/tooltip.tsx), [`dropdown-menu.tsx`](app/components/ui/dropdown-menu.tsx), [`command.tsx`](app/components/ui/command.tsx) | Covers modal, menu, command, and contextual interaction patterns |
| Data display | [`card.tsx`](app/components/ui/card.tsx), [`table.tsx`](app/components/ui/table.tsx), [`badge.tsx`](app/components/ui/badge.tsx), [`alert.tsx`](app/components/ui/alert.tsx), [`progress.tsx`](app/components/ui/progress.tsx), [`spinner.tsx`](app/components/ui/spinner.tsx) | Good base, but limited composition around them |
| Navigation and disclosure | [`tabs.tsx`](app/components/ui/tabs.tsx), [`accordion.tsx`](app/components/ui/accordion.tsx), [`pagination.tsx`](app/components/ui/pagination.tsx) | Present but not consistently adopted |
| Date and time | [`calendar.tsx`](app/components/ui/calendar.tsx), [`datetime.tsx`](app/components/ui/datetime.tsx) | Newer, richer date/time experience than the legacy form control |

### Shared Compositions in `app/components/shared`

| Component | Purpose | Audit note |
| --- | --- | --- |
| [`theme-provider.tsx`](app/components/shared/theme-provider.tsx) | Theme wiring | Foundational |
| [`mode-toggle.tsx`](app/components/shared/mode-toggle.tsx) | Theme toggle | Shared utility |
| [`InfoPopover.tsx`](app/components/shared/InfoPopover.tsx) | Reusable info affordance | Useful composition |
| [`SaveBar.tsx`](app/components/shared/SaveBar.tsx) | Save-state action bar | Shared composition, not a primitive |
| [`TablePagination.tsx`](app/components/shared/TablePagination.tsx) | Shared pagination wrapper | Competes with queue pagination |
| [`ErrorBoundary.tsx`](app/components/shared/ErrorBoundary.tsx) | Shared error boundary | Infrastructure, not styling |
| [`CustomCard.tsx`](app/components/shared/CustomCard.tsx) | Older branded card shell | Legacy parallel card system |
| [`Icons.tsx`](app/components/shared/Icons.tsx) and [`TransparentBGImage.tsx`](app/components/shared/TransparentBGImage.tsx) | Asset helpers | Shared support utilities |

### Legacy Forms Layer in `app/components/forms`

| File | Exports | Audit note |
| --- | --- | --- |
| [`Inputs.tsx`](app/components/forms/Inputs.tsx) | `TextInput`, `Dropdown`, `DateTime`, `DragOver`, `Toggle` | Overlaps with `ui/input`, `ui/select`, `ui/datetime`, `ui/switch` |
| [`AudioSelector.tsx`](app/components/forms/AudioSelector.tsx) | Audio-specific selector | Feature-facing |
| [`InputSelector.tsx`](app/components/forms/InputSelector.tsx) | Input selector | Feature-facing |
| [`OutputSelector.tsx`](app/components/forms/OutputSelector.tsx) | Output selector | Feature-facing |

### Layout Components

- [`app/components/layout/Navbar.tsx`](app/components/layout/Navbar.tsx)
- [`app/components/layout/Navbar.MobileMenu.tsx`](app/components/layout/Navbar.MobileMenu.tsx)

These are useful layout pieces, but there is no broader page-shell system for common screen patterns like centered auth cards, settings sections, or form pages.

### Reusable Table Composition

- [`app/components/workspace/tables/DataTable.tsx`](app/components/workspace/tables/DataTable.tsx): wraps TanStack Table with `ui/table`.

This is the closest thing to a reusable table standard, but it only covers header/body rendering and a default empty row. It does not standardize filters, bulk actions, loading, pagination, row action menus, or toolbar layout.

### Domain-Level Shared Components Worth Noting

These are reusable within features, but they are not yet system primitives:

- `campaign/`
- `queue/`
- `sms-ui/`
- `contact/`
- `call/`
- `audience/`
- `phone-numbers/`
- `invite/`
- `workspace/`

## 2. Gaps in the Component System

### Missing Primitives or Compositions

#### Typography

There is no shared typography layer such as `Heading`, `Text`, `Caption`, or `Prose`. Instead, screens repeatedly hand-roll combinations like `font-Zilla-Slab`, custom tracking, and hardcoded text sizes. This is one of the main reasons branded screens feel visually inconsistent.

#### Form Field Composition

The system has `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, and `Label`, but it does not have a higher-level field primitive that packages:

- label
- description/help text
- validation/error message
- spacing and vertical rhythm
- control-specific wrapper behavior

That missing middle layer is why many routes still write raw `<label>` + `<input>` + helper text blocks by hand.

#### Page and Section Shells

There is no shared screen composition for:

- centered auth forms
- branded card pages
- settings sections
- section headers with actions
- empty state sections

Because of that, the repo keeps recreating card-like shells with manual padding, borders, fonts, and heading styles.

#### Loading States

There is a [`spinner.tsx`](app/components/ui/spinner.tsx), but no skeleton or placeholder system for tables, cards, form sections, or chat views.

#### Missing Common Primitives

I did not find shared implementations for:

- avatar
- radio group
- skeleton

There is also no single shared toaster host, even though `sonner` is used in multiple routes.

### Duplicate or Competing Systems

#### Card System Split

- Preferred primitive: [`app/components/ui/card.tsx`](app/components/ui/card.tsx)
- Legacy parallel system: [`app/components/shared/CustomCard.tsx`](app/components/shared/CustomCard.tsx)

`CustomCard` adds a branded title and action pattern, but it duplicates responsibilities that should likely live on top of `ui/card`. It is still used in multiple routes and settings areas, so both models remain active.

#### Form Control Split

- Preferred primitive layer: `ui/input`, `ui/select`, `ui/textarea`, `ui/switch`, `ui/checkbox`
- Legacy layer: [`app/components/forms/Inputs.tsx`](app/components/forms/Inputs.tsx)

`TextInput`, `Dropdown`, `DateTime`, and `Toggle` overlap with the newer primitives, so there is no single recommended path for basic form building.

#### Date/Time Split

- Preferred newer component: [`app/components/ui/datetime.tsx`](app/components/ui/datetime.tsx)
- Legacy custom alternative: `DateTime` in [`app/components/forms/Inputs.tsx`](app/components/forms/Inputs.tsx)

The newer version is much more complete and keyboard-aware, but the older one still exists and keeps the migration ambiguous.

#### Pagination Split

- [`app/components/shared/TablePagination.tsx`](app/components/shared/TablePagination.tsx)
- [`app/components/queue/QueueTablePagination.tsx`](app/components/queue/QueueTablePagination.tsx)
- direct use of [`app/components/ui/pagination.tsx`](app/components/ui/pagination.tsx)

There is no single pagination composition standard for data-heavy lists.

### Token Adoption Gaps

The design tokens exist, but adoption is uneven:

- brand color tokens are used directly in route classes instead of being expressed through shared components
- typography is encoded ad hoc in screens instead of through a semantic type scale
- the base stylesheet styles raw `input`, `select`, and `textarea`, which makes native controls look acceptable and reduces pressure to migrate to shared primitives

That combination encourages “close enough” custom markup instead of system usage.

## 3. Gaps in Implementation

This section covers places where the shared component system either is not used or is only partially used.

### Auth and Entry Flows

#### [`app/routes/signin.tsx`](app/routes/signin.tsx)

- Uses native `<input>` elements for email and password
- Uses route-specific label typography and spacing
- Uses `Button`, but overrides it heavily with custom brand classes
- Mounts its own `Toaster`

This route is a good example of the system being present but not applied.

#### Related routes with similar issues

- [`app/routes/signup.tsx`](app/routes/signup.tsx)
- [`app/routes/accept-invite.tsx`](app/routes/accept-invite.tsx)
- [`app/routes/remember.tsx`](app/routes/remember.tsx)
- [`app/routes/reset-password.tsx`](app/routes/reset-password.tsx)

Notably, parts of the invite flow already use shared primitives in:

- [`app/components/invite/welcome/NameFields.tsx`](app/components/invite/welcome/NameFields.tsx)
- [`app/components/invite/welcome/PasswordFields.tsx`](app/components/invite/welcome/PasswordFields.tsx)
- [`app/components/invite/welcome/ErrorAlert.tsx`](app/components/invite/welcome/ErrorAlert.tsx)

That makes auth/invite a strong candidate for consolidation.

### Workspace Landing and Creation

#### [`app/routes/workspaces.tsx`](app/routes/workspaces.tsx)

- `NewWorkspaceDialog` still uses a native `<input>` instead of `Input`
- `WorkspaceCard` uses route-level styling for card, typography, and role treatment
- The page heading uses custom typography instead of a shared heading primitive

This page mixes modern `Dialog` and `Button` usage with old manual styling.

### Workspace Creation and Setup Flows

The following routes still lean on older patterns:

- [`app/routes/workspaces_.$id.campaigns_.new.tsx`](app/routes/workspaces_.$id.campaigns_.new.tsx)
- [`app/routes/workspaces_.$id.scripts_.new.tsx`](app/routes/workspaces_.$id.scripts_.new.tsx)
- [`app/routes/workspaces_.$id.audiences_.new.tsx`](app/routes/workspaces_.$id.audiences_.new.tsx)
- [`app/routes/workspaces_.$id.audios_.new.tsx`](app/routes/workspaces_.$id.audios_.new.tsx)
- [`app/routes/workspaces_.$id.campaigns.$campaign_id.audiences.new.tsx`](app/routes/workspaces_.$id.campaigns.$campaign_id.audiences.new.tsx)

Common issues:

- `CustomCard` usage
- native inputs/selects
- route-specific headings and spacing

By contrast, newer setup screens like [`app/routes/workspaces_.$id.onboarding.tsx`](app/routes/workspaces_.$id.onboarding.tsx) already rely more heavily on `Card`, `Input`, `Label`, and `Textarea`, but still contain native `select` and checkbox patterns in places.

### Settings and Team Management

#### [`app/routes/workspaces_.$id.settings.tsx`](app/routes/workspaces_.$id.settings.tsx)

- Uses `CustomCard`
- Still mixes shared primitives with raw controls
- Continues older branded layout conventions rather than a reusable settings-section shell

#### [`app/components/workspace/TeamMember.tsx`](app/components/workspace/TeamMember.tsx)

- Uses native controls
- Uses custom role-color and typography treatment
- Represents a reusable team-management pattern that is not yet systematized

#### Additional related files

- [`app/components/workspace/ApiKeysSection.tsx`](app/components/workspace/ApiKeysSection.tsx)
- [`app/components/workspace/WebhookEditor.tsx`](app/components/workspace/WebhookEditor.tsx)

These are representative settings modules that still bypass the primitive layer.

### Contact Management

#### Legacy form wrapper usage

- [`app/components/contact/ContactDetailsFields.tsx`](app/components/contact/ContactDetailsFields.tsx)
- [`app/components/contact/ContactDetailsOtherFields.tsx`](app/components/contact/ContactDetailsOtherFields.tsx)

These still import the legacy controls from [`app/components/forms/Inputs.tsx`](app/components/forms/Inputs.tsx).

#### Raw form markup

- [`app/components/contact/ContactForm.tsx`](app/components/contact/ContactForm.tsx)

This form uses raw `input` fields with minimal classes and only uses the shared system for the submit `Button`. It is a strong example of why a `FormField` composition is missing.

### Phone Numbers and Messaging

#### [`app/components/phone-numbers/NumbersTable.tsx`](app/components/phone-numbers/NumbersTable.tsx)

- Uses a raw `<table>`
- Uses route-level heading typography
- Uses inline editing with native `<input>`
- Composes table behavior manually rather than through `DataTable`

#### [`app/components/phone-numbers/NumberPurchase.tsx`](app/components/phone-numbers/NumberPurchase.tsx)

- Uses bespoke controls and list interactions
- Does not appear to follow one shared table or filter pattern

#### [`app/components/sms-ui/ChatHeader.tsx`](app/components/sms-ui/ChatHeader.tsx)

- Uses custom dropdown buttons and menu panels
- Uses a native `tel` input
- Uses ad hoc panel styling for the “existing conversation” surface
- Mixes `Button` with custom button implementations rather than using `DropdownMenu`, `Input`, or shared menu/list patterns

#### Parent route

- [`app/routes/workspaces_.$id_.settings_.numbers.tsx`](app/routes/workspaces_.$id_.settings_.numbers.tsx)

This route uses `Dialog` and `Button`, but its nested components still operate outside a standardized table/form pattern.

### Admin Flows

#### [`app/routes/admin_.workspaces.$workspaceId.twilio.tsx`](app/routes/admin_.workspaces.$workspaceId.twilio.tsx)

This route is especially useful because it shows partial system adoption:

- uses `Label` and `Input` for text fields
- still uses native `<select>` for `sendMode`, `defaultMessageIntent`, and other fields
- still uses a native checkbox with manual wrapper styling for `trafficShapingEnabled`

This is not a “missing component” problem. It is an adoption and composition problem.

### Tables and Data-Dense Screens

#### Existing reusable table base

- [`app/components/workspace/tables/DataTable.tsx`](app/components/workspace/tables/DataTable.tsx)

#### Manual or bespoke table implementations still in use

- [`app/routes/workspaces_.$id.billing.tsx`](app/routes/workspaces_.$id.billing.tsx)
- [`app/routes/workspaces_.$id.surveys_.$surveyId_.responses.tsx`](app/routes/workspaces_.$id.surveys_.$surveyId_.responses.tsx)
- [`app/components/queue/QueueTable.tsx`](app/components/queue/QueueTable.tsx)
- [`app/components/call/CallScreen.QueueList.tsx`](app/components/call/CallScreen.QueueList.tsx)
- [`app/components/phone-numbers/NumbersTable.tsx`](app/components/phone-numbers/NumbersTable.tsx)

The shared table foundation exists, but there is no full table pattern for:

- filter bars
- summary counts
- action rows
- selection
- pagination
- loading states
- empty states beyond “No results”

That is why each feature keeps rebuilding its own list UI.

### Buttons, Links, and Button-Like Actions

The button primitive supports `asChild`, but not all routes use it for links or download actions. That leads to copied button-like styling in places like:

- [`app/components/campaign/home/CampaignHomeScreen/AsyncExportButton.tsx`](app/components/campaign/home/CampaignHomeScreen/AsyncExportButton.tsx)
- [`app/routes/workspaces_.$id.exports.tsx`](app/routes/workspaces_.$id.exports.tsx)

This is another example where the primitive exists, but the intended usage pattern is not consistently enforced.

## 4. Root Causes

The inconsistencies mostly come from four structural causes:

1. The repo never fully migrated from `CustomCard` and `forms/Inputs` to `ui/*`.
2. There is no middle layer for common screen composition such as form fields, page shells, and settings sections.
3. The table system stops at the primitive level, so complex list screens keep inventing their own patterns.
4. Brand styling is encoded directly in routes instead of being captured in reusable components and typography primitives.

## 5. Recommended Canonical Direction

If the goal is a unified design system, the clearest canonical path is:

- treat [`app/components/ui/`](app/components/ui/) as the only primitive layer
- treat `CustomCard` and `forms/Inputs` as legacy surfaces to be deprecated
- add missing composition primitives rather than adding more route-specific styling

### Highest-Value Missing Additions

1. `Heading` and `Text` typography primitives
2. `FormField` and related form-section composition
3. shared page-shell components for auth, settings, and section layouts
4. one table composition pattern built on `DataTable`
5. one shared toaster host and loading/skeleton pattern

### Highest-Value Adoption Targets

1. Auth routes
2. `workspaces.tsx`
3. workspace creation routes
4. settings and team-management screens
5. phone-number and messaging screens

## 6. Suggested Next Audit-to-Implementation Sequence

1. Replace `forms/Inputs` usage with `ui/*` plus a new `FormField` composition.
2. Rebuild `CustomCard` consumers on top of `ui/card` or replace it with branded card subcomponents.
3. Standardize auth, workspace creation, and settings shells with shared layout primitives.
4. Expand `DataTable` into a full table pattern with toolbar, pagination, and empty/loading states.
5. Add typography primitives so route code stops defining branded type styles ad hoc.

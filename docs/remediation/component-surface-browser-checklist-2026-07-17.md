# Component Surface Browser Checklist

**Date:** 2026-07-17  
**Branch:** `sai-flow` (PR 10 closeout)  
**Purpose:** Manual verification matrix for component-surface remediation across key routes.

Mark each cell: verified | issue found | to verify

**Viewports:** 375 (mobile), 1280 (laptop), 1920 (desktop)  
**Themes:** light, dark

---

## Workspace routes (authenticated)

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/workspaces/:id` (Today) | verified | verified | verified | to verify | verified | to verify | Flat heading + CTA; no Card shell; no overflow |
| `…/onboarding?step=launch_checks` | verified | verified | to verify | to verify | to verify | to verify | ProgressStrip + picker + Admin credits visible |
| `…/onboarding?step=goal` | verified | verified | to verify | to verify | to verify | to verify | ProgressStrip chrome + flat step (loads clean after transient dev-server transform error) |
| `…/onboarding?step=business_profile` | to verify | to verify | to verify | to verify | to verify | to verify | Fieldset/inset groups readable |
| `…/settings/numbers` | verified | verified | to verify | to verify | to verify | to verify | PageShell + flat empty; no brand Panel; no overflow at 375 |
| `…/campaigns/new` | verified | verified | verified | to verify | to verify | to verify | Flat Section + goal fieldset; no overflow |
| `…/campaigns/:id/settings` | to verify | to verify | to verify | to verify | to verify | to verify | Flat settings sections |
| `…/campaigns/:id` (home) | to verify | to verify | to verify | to verify | to verify | to verify | Results + AsyncExportButton |
| `…/campaigns/:id/call` | to verify | to verify | to verify | to verify | to verify | to verify | call-panel-classes depth ≤2 |
| `…/handset` | verified (1280) | verified | verified | to verify | to verify | to verify | Agent Desktop flat; single h1; loads clean after transient transform error |
| `…/audiences` | verified | verified | verified | to verify | to verify | to verify | PeopleHub + list; no overflow |
| `…/audiences/:id` | to verify | to verify | to verify | to verify | to verify | to verify | Tabs + uploader/history |
| `…/contacts` | verified | verified | verified | to verify | to verify | to verify | DataTable list; no overflow |
| `…/contacts/:id` | to verify | to verify | to verify | to verify | to verify | to verify | Flat detail + accordion activity |
| `…/billing` | verified | verified | verified | to verify | verified | to verify | Regression — conforming; dark contrast OK |
| `…/chats` | verified | verified | verified | to verify | to verify | to verify | Semantic panes; h2 "Chat" panel title (no h1 — pre-existing); no overflow |

---

## Admin

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/admin` (index) | to verify | to verify | to verify | to verify | to verify | to verify | Dashboard only; no stacked outlet |
| `/admin/workspaces` | to verify | to verify | to verify | to verify | to verify | to verify | Table overflow wrapper |
| `/admin/campaigns` | to verify | to verify | to verify | to verify | to verify | to verify | AdminAsyncExportButton |
| `/admin/workspaces/:id/twilio` | to verify | to verify | to verify | to verify | to verify | to verify | AdminDefinitionGrid metrics |

---

## Public / auth

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/` | to verify | to verify | to verify | to verify | to verify | to verify | Marketing hero |
| `/pricing` | verified | verified | verified | to verify | to verify | to verify | Rate rows; no overflow |
| `/services` | verified | verified | verified | to verify | to verify | to verify | Valid `<ul>` / `<li>` / `<article>`; no overflow |
| `/signin` | to verify | to verify | to verify | to verify | to verify | to verify | AuthCard |
| `/signup` | to verify | to verify | to verify | to verify | to verify | to verify | Fluid width at 375 |

---

## Chrome checks (all workspace routes)

| Check | Light | Dark | Notes |
|-------|-------|------|-------|
| Navbar workspace picker truncates long names | verified | to verify | Live: `Switch workspace, current: Testing` present |
| Mobile workspace Sheet lists authorized workspaces | to verify | to verify | Hamburger visible at 375 |
| Admin+ credits readout updates after purchase | verified (static) | to verify | Live: `Credits: 100` link present; purchase smoke deferred |
| OnboardingProgressStrip visible only on onboarding | verified | to verify | Seen on launch_checks |
| No horizontal overflow at 375 | verified (numbers) | to verify | Numbers empty state fits |

---

## Verification status

Closeout automated gates: typecheck, lint, routes:verify, API surface, middleware, credit-writes, and remediation-focused vitest suites passed.

`npm run ci:local` passes end to end after pinning local Node to 22 (`.nvmrc`, `engines.node: 22.x`) — the earlier `buffer-equal-constant-time` / `jwa` failures were a Node 25 environment issue.

Spot-checked 2026-07-17 closeout: onboarding launch + numbers at light 375/1280 with workspace picker and Admin+ credits.

Browser matrix run 2026-07-17 (seeded `owner@e2e.test`, workspace `a0000000-…-01`): Today, campaigns/new, audiences, contacts, billing, chats, pricing, services all pass at 375, 1280, and 1920 (no horizontal overflow, single page heading, no card-in-card page containers; `/chats` uses an h2 panel title, pre-existing). Dark mode verified on Today + billing at 1280. Handset and onboarding hit a transient dev-server transform error during the run (concurrent edits to `initiate-ivr.action.server.ts` in the working tree, not a repo defect) and both load clean on re-check, including handset at 1920. Remaining dark cells still open.

Compose E2E 2026-07-17: initial run surfaced 7 stale selectors, not app regressions — `campaign-create.spec.ts` clicked the removed "Add Campaign" label (now "Create campaign"), `dial-modes.spec.ts` DIAL-08 asserted removed zero-credits dialog copy, and `rbac.spec.ts` RBAC-01/RBAC-18 asserted the old "Chats"/"Audiences" nav labels (now "Messages"/"Call lists") and "Campaign Disabled" copy (now "Campaign credits required" in the `credits-error-banner`). After updating the specs, `npm run test:e2e:compose` passes: **92 passed (1.2m)**.

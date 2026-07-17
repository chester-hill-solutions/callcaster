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
| `/workspaces/:id` (Today) | to verify | to verify | to verify | to verify | to verify | to verify | Flat heading + CTA; no Card shell |
| `…/onboarding?step=launch_checks` | verified | verified | to verify | to verify | to verify | to verify | ProgressStrip + picker + Admin credits visible |
| `…/onboarding?step=goal` | to verify | to verify | to verify | to verify | to verify | to verify | ProgressStrip chrome + flat step |
| `…/onboarding?step=business_profile` | to verify | to verify | to verify | to verify | to verify | to verify | Fieldset/inset groups readable |
| `…/settings/numbers` | verified | verified | to verify | to verify | to verify | to verify | PageShell + flat empty; no brand Panel; no overflow at 375 |
| `…/campaigns/new` | to verify | to verify | to verify | to verify | to verify | to verify | Flat Section + goal fieldset |
| `…/campaigns/:id/settings` | to verify | to verify | to verify | to verify | to verify | to verify | Flat settings sections |
| `…/campaigns/:id` (home) | to verify | to verify | to verify | to verify | to verify | to verify | Results + AsyncExportButton |
| `…/campaigns/:id/call` | to verify | to verify | to verify | to verify | to verify | to verify | call-panel-classes depth ≤2 |
| `…/handset` | to verify | to verify | to verify | to verify | to verify | to verify | Softphone flat section |
| `…/audiences` | to verify | to verify | to verify | to verify | to verify | to verify | PeopleHub + list |
| `…/audiences/:id` | to verify | to verify | to verify | to verify | to verify | to verify | Tabs + uploader/history |
| `…/contacts` | to verify | to verify | to verify | to verify | to verify | to verify | DataTable list |
| `…/contacts/:id` | to verify | to verify | to verify | to verify | to verify | to verify | Flat detail + accordion activity |
| `…/billing` | to verify | to verify | to verify | to verify | to verify | to verify | Regression — already conforming |
| `…/chats` | to verify | to verify | to verify | to verify | to verify | to verify | Semantic panes; control a11y open |

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
| `/pricing` | to verify | to verify | to verify | to verify | to verify | to verify | Rate rows |
| `/services` | to verify | to verify | to verify | to verify | to verify | to verify | Valid `<ul>` / `<li>` / `<article>` |
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

`npm run ci:local` failed at `test:node` on a pre-existing environment issue: `buffer-equal-constant-time` / `jwa` (`Buffer.prototype` undefined) affecting many auth-related node tests unrelated to surface remediation. Full dark-theme and remaining viewport cells remain for follow-up.

Spot-checked 2026-07-17 closeout: onboarding launch + numbers at light 375/1280 with workspace picker and Admin+ credits.

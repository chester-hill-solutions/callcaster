# Component Surface Browser Checklist

**Date:** 2026-07-17  
**Branch:** `sai-flow` (PR 10 closeout)  
**Purpose:** Manual verification matrix for component-surface remediation across key routes.

Mark each cell: ✅ verified | ⚠️ issue found | ⬜ to verify

**Viewports:** 375 (mobile), 1280 (laptop), 1920 (desktop)  
**Themes:** light, dark

---

## Workspace routes (authenticated)

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/workspaces/:id` (Today) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Flat heading + CTA; no Card shell |
| `…/onboarding?step=goal` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ProgressStrip chrome + flat step |
| `…/onboarding?step=business_profile` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Fieldset/inset groups readable |
| `…/settings/numbers` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | No brand Panel; flat empty state |
| `…/campaigns/new` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Flat Section + goal fieldset |
| `…/campaigns/:id/settings` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Flat settings sections |
| `…/campaigns/:id` (home) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Results + AsyncExportButton |
| `…/campaigns/:id/call` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | call-panel-classes depth ≤2 |
| `…/handset` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Softphone flat section |
| `…/audiences` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | PeopleHub + list |
| `…/audiences/:id` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Tabs + uploader/history |
| `…/contacts` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | DataTable list |
| `…/contacts/:id` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Flat detail + accordion activity |
| `…/billing` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Regression — already conforming |
| `…/chats` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Semantic panes; control a11y open |

---

## Admin

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/admin` (index) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Dashboard only; no stacked outlet |
| `/admin/workspaces` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Table overflow wrapper |
| `/admin/campaigns` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | AdminAsyncExportButton |
| `/admin/workspaces/:id/twilio` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | AdminDefinitionGrid metrics |

---

## Public / auth

| Route | Light 375 | Light 1280 | Light 1920 | Dark 375 | Dark 1280 | Dark 1920 | Notes |
|-------|-----------|------------|------------|----------|-----------|-----------|-------|
| `/` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Marketing hero |
| `/pricing` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Rate rows |
| `/services` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Valid `<ul>` / `<li>` / `<article>` |
| `/signin` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | AuthCard |
| `/signup` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Fluid width at 375 |

---

## Chrome checks (all workspace routes)

| Check | Light | Dark | Notes |
|-------|-------|------|-------|
| Navbar workspace picker truncates long names | ⬜ | ⬜ | |
| Mobile workspace Sheet lists authorized workspaces | ⬜ | ⬜ | |
| Admin+ credits readout updates after purchase | ⬜ | ⬜ | Requires billing action |
| OnboardingProgressStrip visible only on onboarding | ⬜ | ⬜ | |
| No horizontal overflow at 375 | ⬜ | ⬜ | |

---

## Verification status

Automated closeout (PR 10) did not run live browser passes. All cells default to **to verify**.

Prior light-theme spot checks (2026-07-17 audit): onboarding business basics and billing conforming at 375/1280/1920.

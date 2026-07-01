# CallCaster User Journey Audit

**Date:** 2026-06-30
**Scope:** Full audit across all user types
**Routes scanned:** 477 | **Components scanned:** 156

---

## Executive Summary

CallCaster serves three distinct user types across a React Router v7 application with 477 routes. The surface is large and feature-rich, but several friction points create drop-off risk—especially in the pre-value compliance funnel, the campaign creation/settings loop, and the agent call-screen complexity.

**Top themes:**
1. **Long time-to-value:** New users hit a 6-step compliance onboarding before they can send a message or place a call.
2. **Journey fragmentation:** Campaign creation, settings, script editing, and queue management are spread across four sub-routes with no unified wizard.
3. **Agent UX complexity:** The call screen composes ~15+ hooks; status, audio, and queue state can desync.
4. **Invite-only signup mismatch:** `/signup` is a contact form, not self-service registration—users expect to create accounts.
5. **Dead ends and missing CTAs:** Voicemails page has no upload button; analytics has no date picker; exports page cannot trigger exports.

---

## User Types

| Role | Primary Goals |
|------|--------------|
| **Campaign Manager / Admin** | Create workspace → onboard → build campaign → manage queue → review results → manage billing |
| **Caller / Agent** | Join campaign → dial/SMS contacts → disposition → repeat → handle inbound calls |
| **System Admin** | Monitor workspaces/users → invite members → reconcile Twilio billing → manage system settings |

---

## Journey Maps

### 1. New User: Sign Up → First Campaign

| Field | Detail |
|-------|--------|
| **Goal** | Create an account and launch the first outreach campaign |
| **Trigger** | User visits `/signup` or receives an invite email |
| **Steps** | 1. `/signup` (contact form) → 2. Wait for invite / click invite link → 3. `/accept-invite` (set password, accept workspace) → 4. `/workspaces` (create or select workspace) → 5. `/workspaces/{id}/onboarding` (6-step wizard) → 6. `/workspaces/{id}/campaigns/new` → 7. Campaign settings → 8. Queue → 9. Script → 10. Launch |
| **Components** | `AuthCard`, `NewUserSignUp`, `ExistingUserInvites`, `OnboardingWizard`, `OnboardingBusinessBasicsStep`, `OnboardingChannelsStep`, `OnboardingFirstNumberStep`, `CampaignBasicInfo`, `CampaignSettings`, `CampaignSettingsQueue`, `CampaignSettings.Script` |
| **Actions** | Submit contact form → Click invite link → Set password → Accept invite → Create workspace → Step through onboarding wizard → Name campaign → Select type/phase → Save settings → Add audience to queue → Edit script → Start campaign |
| **Outcome** | Campaign status = `running`; contacts are in queue; agents can dial |
| **Pain points** | • `/signup` is a lead form, not registration—users cannot self-serve create accounts.<br>• Invite link requires password setup even after email verification.<br>• No auto-redirect to onboarding after workspace creation.<br>• Onboarding is 6 steps with carrier compliance (A2P, RCS, 10DLC) blocking progress.<br>• Credits are required to rent a number; user must leave wizard to visit `/billing`.<br>• Campaign creation is fragmented: name → settings → queue → script → status change. |

### 2. Returning User: Sign In → Dial

| Field | Detail |
|-------|--------|
| **Goal** | Log in and start making calls or sending SMS |
| **Trigger** | User navigates to `/signin` |
| **Steps** | 1. `/signin` (email + password) → 2. `/workspaces` → 3. Select workspace → 4. `/workspaces/{id}/campaigns/{campaign_id}/call` OR `/workspaces/{id}/chats` |
| **Components** | `AuthCard`, `WorkspaceOverview`, `CampaignList`, `CallScreen.Layout`, `CallScreen.CallArea`, `ChatThreadView`, `SoftphonePanel` |
| **Actions** | Enter credentials → Select workspace → Select campaign → Click "Join" → Dial or start predictive dialing → Fill questionnaire → Set disposition → Save & Next |
| **Outcome** | Call attempt saved; next contact loaded from queue |
| **Pain points** | • No OAuth login visible in UI despite icon imports.<br>• Campaign home screen has heavy 2-second realtime revalidation.<br>• Call screen state is deeply nested in `useCallScreen` (~15 hooks); risk of desync.<br>• "Save and Next" is disabled until disposition selected, but visual prompt is weak.<br>• Predictive vs. manual dial changes UI behavior significantly without clear indication. |

### 3. Campaign Manager: Build & Launch a Campaign

| Field | Detail |
|-------|--------|
| **Goal** | Create a campaign, add contacts, set a script, and launch it |
| **Trigger** | User clicks "Add Campaign" from `/workspaces/{id}/campaigns` |
| **Steps** | 1. `/campaigns/new` (name, type, phase) → 2. `/campaigns/{id}` (dashboard) → 3. `/campaigns/{id}/settings` (configure details) → 4. `/campaigns/{id}/queue` (add contacts) → 5. `/campaigns/{id}/script/edit` (write script) → 6. Return to dashboard → 7. Click Play (start) |
| **Components** | `CampaignBasicInfo`, `CampaignDetailed`, `CampaignSettings`, `CampaignSettingsQueue`, `QueueContent`, `QueueTable`, `CampaignSettings.Script`, `MessageSettings`, `CampaignHeader`, `CampaignNav` |
| **Actions** | Name campaign → Select type (Live / Message / IVR) → Select phase → Save settings → Add audience to queue OR search/add individual contacts → Edit script pages/questions → Save or Save as Copy → Start/Pause/Schedule/Archive |
| **Outcome** | Campaign is configured, queued, scripted, and running |
| **Pain points** | • Four separate sub-routes for one workflow; no unified wizard.<br>• Type change opens a confirmation dialog and warns about clearing content.<br>• Save bar blocks status transitions if unsaved changes exist.<br>• "Save or Copy" modal appears on every script save.<br>• Message campaigns use an entirely different editor (`MessageSettings`) from live/IVR campaigns.<br>• Empty state only shows for owners/admins; other roles see nothing. |

### 4. Agent: Handle Inbound Calls & SMS

| Field | Detail |
|-------|--------|
| **Goal** | Answer inbound calls and manage SMS conversations |
| **Trigger** | Agent navigates to `/workspaces/{id}/calls` or `/workspaces/{id}/chats` |
| **Steps** | **Calls:** 1. `/calls` → 2. Configure handset number in settings (if missing) → 3. Click "Start listening" → 4. Answer incoming call via `IncomingCallPanel` → 5. Review call log table.<br><br>**Chats:** 1. `/chats` → 2. Select conversation or search contact number → 3. Type/select from number → 4. Send message (with optional images) → 5. Scroll history via infinite load |
| **Components** | `IncomingCallReceiver`, `IncomingCallPanel`, `CallLogTable`, `SoftphonePanel`, `ChatThreadView`, `ChatMessages`, `ChatInput`, `ChatHeader`, `ChatOptOutBanner` |
| **Actions** | Start/Stop listening → Answer/Decline call → Set status (Available/Away/Offline) → Select reason → Dial outbound → Click conversation → Type message → Attach image → Send → Hide STOP conversations |
| **Outcome** | Inbound call answered or SMS sent; conversation updated in real time |
| **Pain points** | • Two inbound call surfaces (`/calls` and `/handset`) confuse agents.<br>• Handset requires pre-configuration; no inline setup from the calls page.<br>• Status change requires reason selection in two steps; clunky.<br>• Chat textarea is cleared via DOM manipulation, not React state.<br>• Realtime inserts auto-scroll the thread, interrupting reading.<br>• Mobile chat requires extra taps to open/close conversation sheet. |

### 5. System Admin: Monitor & Manage

| Field | Detail |
|-------|--------|
| **Goal** | Monitor system health, manage workspaces and users, reconcile billing |
| **Trigger** | Admin navigates to `/admin` |
| **Steps** | 1. `/admin` (stats cards + tabs) → 2. Switch to Workspaces / Users / Campaigns / System Settings → 3. Drill into workspace → 4. Invite users → 5. Review Twilio portal (billing, health, config changes, messaging signals) |
| **Components** | `AdminWorkspacesPanel`, `AdminUsersPanel`, `AdminCampaignsPanel`, `AdminSystemSettingsPanel`, `AdminTwilioPortal.HealthPanel`, `AdminTwilioPortal.BillingReconciliationPanel` |
| **Actions** | Switch tabs → Search/filter workspaces/users → Invite user (email + role) → View Twilio health metrics → Review billing reconciliation |
| **Outcome** | Workspace/user invited; system health monitored; billing discrepancies identified |
| **Pain points** | • System status is hardcoded "Operational" with a green dot (not dynamic).<br>• No quick actions in the admin layout; all actions live in sub-panel components.<br>• `Outlet` rendered below tabs may cause layout confusion.<br>• Truncated user IDs shown instead of names in member lists. |

### 6. Billing: Credits & Number Purchase

| Field | Detail |
|-------|--------|
| **Goal** | Purchase credits and rent phone numbers |
| **Trigger** | User navigates to `/workspaces/{id}/billing` or `/workspaces/{id}/settings/numbers/purchase` |
| **Steps** | 1. `/billing` (view balance, expand rates, select package) → 2. Stripe checkout redirect → 3. Return with `?payment_status=success|error|canceled` → 4. Go to `/settings/numbers` → 5. Click "Purchase" → 6. Search numbers → 7. Buy (credits gate) |
| **Components** | `NumberPurchase`, `NumberPurchase.SearchForm`, `NumberPurchase.ConfirmDialog`, `NumberRentalCreditsAlert`, `NumbersTable` |
| **Actions** | Select credit package → Enter custom amount → Purchase Credits → Search numbers by criteria → Select → Confirm purchase |
| **Outcome** | Credits added; number rented and active in workspace |
| **Pain points** | • No inline top-up from number purchase page; must leave to `/billing`.<br>• Custom amount input silently disables button below minimum with no inline error.<br>• Back button on numbers page is disabled during any fetcher update.<br>• Usage log is read-only with no filtering or pagination. |

---

## Pain Points Matrix

| Pain Point | Severity | Affected Journeys | User Types |
|-----------|----------|-------------------|------------|
| Signup page is a lead form, not self-service registration | **High** | 1 | All new users |
| 6-step compliance onboarding before any value | **High** | 1 | Campaign managers |
| Campaign creation split across 4+ sub-routes | **High** | 3 | Campaign managers |
| Call screen state complexity (~15 hooks) | **High** | 2, 4 | Callers |
| No auto-redirect to onboarding after workspace creation | **Medium** | 1 | Campaign managers |
| "Save or Copy" modal on every script save | **Medium** | 3 | Campaign managers |
| Two inbound call surfaces (`/calls` vs `/handset`) | **Medium** | 4 | Callers |
| Chat auto-scroll interrupts reading | **Medium** | 4 | Callers |
| Credits required mid-onboarding with no inline top-up | **Medium** | 1, 6 | Campaign managers |
| System status hardcoded in admin dashboard | **Low** | 5 | System admins |
| Voicemails page has no upload CTA | **Low** | — | Campaign managers |
| Analytics has no date picker visible in route | **Low** | — | Campaign managers |
| Exports page cannot trigger exports | **Low** | — | Campaign managers |

---

## Mermaid Flowcharts

### New User: Sign Up → First Campaign

```mermaid
flowchart TD
    A[Visit /signup] --> B[Submit contact form]
    B --> C{Wait for invite}
    C -->|Invite email| D[Click link → /accept-invite]
    D --> E[Set password + accept workspace]
    E --> F[/workspaces]
    F --> G[Create or select workspace]
    G --> H[/workspaces/{id}/onboarding]
    H --> I[Intro step]
    I --> J[Business basics]
    J --> K[Channels]
    K --> L[Messaging service]
    L --> M[First number]
    M -->|Need credits?| N[/billing]
    N --> M
    M --> O[Provider setup]
    O --> P[Review & launch]
    P --> Q[/workspaces/{id}]
    Q --> R[/campaigns/new]
    R --> S[Name + type + phase]
    S --> T[/campaigns/{id}/settings]
    T --> U[/campaigns/{id}/queue]
    U --> V[/campaigns/{id}/script/edit]
    V --> W[Save script]
    W --> T
    T -->|Click Play| X[Campaign running]
```

### Returning User: Sign In → Dial

```mermaid
flowchart TD
    A[Visit /signin] --> B[Enter email + password]
    B --> C[/workspaces]
    C --> D[Select workspace]
    D --> E[/campaigns]
    E --> F[Select campaign]
    F --> G[/campaigns/{id}]
    G -->|Join| H[/campaigns/{id}/call]
    H --> I[Initialize Twilio device]
    I --> J{Manual or Predictive?}
    J -->|Manual| K[Select contact → Dial]
    J -->|Predictive| L[Start Dialing]
    K & L --> M[Connected]
    M --> N[Fill questionnaire/script]
    N --> O[Set disposition]
    O --> P[Save & Next]
    P --> Q{Queue empty?}
    Q -->|No| K
    Q -->|Yes| R[Done]
```

### Agent: Handle Inbound Calls & SMS

```mermaid
flowchart TD
    A[/calls] --> B{Handset configured?}
    B -->|No| C[/settings/numbers]
    B -->|Yes| D[Click Start listening]
    D --> E[Waiting for calls...]
    E -->|Incoming| F[IncomingCallPanel]
    F --> G[Answer / Decline]
    G --> H[Review call log]

    I[/chats] --> J[Conversation list]
    J --> K[Select conversation]
    K --> L[Chat thread]
    L --> M[Type message]
    M --> N[Attach images?]
    N --> O[Send]
    O --> P[Optimistic update + realtime]
    P --> L
```

---

## Recommendations

### Must Do (High Impact)

1. **Fix signup flow:** Either make `/signup` a true self-service registration page or clearly label it as "Request a demo" to set expectations. The invite-only model is fine, but the UI should not pretend to be a registration form.
2. **Unify campaign creation:** Build a single wizard route (`/campaigns/new`) that walks through name → type → settings → audience → script → review → launch, instead of requiring users to hop across 4 sub-routes.
3. **Simplify onboarding:** Consider a "quick start" path that lets users place a test call or send a test SMS after step 2 (business basics), deferring A2P/RCS deep configuration until after first value. Move compliance to a secondary "complete setup" prompt.
4. **Reduce call-screen state complexity:** Document and test the `useCallScreen` hook boundary. Add route-level error boundaries and loading states so Twilio/device failures do not trap the agent.

### Should Do (Medium Impact)

5. **Add inline credit top-up:** From the onboarding "first number" step and the number purchase page, add a "Buy credits" button that opens a Stripe checkout in a popup or redirects with a clear return path.
6. **Consolidate inbound call surfaces:** Either merge `/calls` and `/handset` into a single "Communications" hub, or make `/handset` the canonical inbound seat and `/calls` read-only for logs.
7. **Fix script save friction:** Remove the "Save or Copy" modal from the default save action. Use "Save" by default; add an explicit "Duplicate script" action in the menu.
8. **Improve chat UX:** Add a "scroll lock" toggle so realtime messages do not auto-scroll when the user is reading history. Use controlled state for the textarea instead of DOM manipulation.

### Could Do (Nice to Have)

9. **Add missing CTAs:** Voicemails page should have an upload button. Analytics should expose the date range picker. Exports page should have a "New export" trigger.
10. **Admin dashboard health:** Replace the hardcoded "Operational" badge with a real health check (e.g., Twilio API latency, recent error rate).
11. **Mobile chat polish:** On mobile, selecting a conversation should auto-open the thread without requiring an extra sheet toggle.

---

## User Story Backlog

| Priority | Story |
|----------|-------|
| **Must** | As a new user, I want to sign up and create my own account without waiting for an invite, so that I can start using CallCaster immediately. |
| **Must** | As a campaign manager, I want a single wizard to create and launch a campaign, so that I don't have to navigate through 4 separate settings pages. |
| **Must** | As a campaign manager, I want to send a test message or make a test call after basic workspace setup, so that I see value before finishing all compliance steps. |
| **Must** | As a caller, I want the call screen to recover gracefully from Twilio or token errors, so that I am not trapped mid-session with no clear next step. |
| **Should** | As a campaign manager, I want to buy credits without leaving the number purchase flow, so that I can complete setup in one session. |
| **Should** | As a caller, I want a single place to handle inbound calls and call logs, so that I don't have to choose between `/calls` and `/handset`. |
| **Should** | As a campaign manager, I want "Save" to save my script directly, and "Duplicate" to be a separate action, so that I am not interrupted by a modal on every edit. |
| **Should** | As an agent, I want chat history to stop auto-scrolling when I am reading old messages, so that I can review context without losing my place. |
| **Could** | As a campaign manager, I want to upload a voicemail greeting directly from the voicemails page, so that I don't have to hunt for the upload action elsewhere. |
| **Could** | As a campaign manager, I want to filter analytics by date range, so that I can review performance for specific periods. |
| **Could** | As a system admin, I want the admin dashboard to show real system health metrics, so that I can spot issues without manually checking Twilio. |

---

*Generated by user-journey-mapping skill.*

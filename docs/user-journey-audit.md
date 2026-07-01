# CallCaster User Journey Audit

**Date:** 2026-06-30
**Scope:** Full audit across all user types
**Journeys mapped:** 20 | **Routes scanned:** 477 | **Components scanned:** 156

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

### 7. Contact Management

| Field | Detail |
|-------|--------|
| **Goal** | View, create, edit, and search workspace contacts |
| **Trigger** | User navigates to `/workspaces/{id}/contacts` |
| **Steps** | 1. `/contacts` (contact table with filters) → 2. Click contact row → 3. `/contacts/{contactId}` (detail view with edit form) → 4. Save or cancel |
| **Components** | `ContactTable`, `ContactDetails`, `ContactDetailsFields`, `ContactForm`, `RecentContacts` |
| **Actions** | Filter by name/phone/email → Click contact → Edit fields → Save → Navigate back |
| **Outcome** | Contact information updated; agents see updated details during calls |
| **Pain points** | • Contact creation is not available from `/contacts` route; only from audience upload or campaign queue.<br>• Contact detail page has no quick-action to start a call or SMS to this contact.<br>• Recent contacts list is a separate component not integrated into the main contacts table. |

### 8. Audience Management

| Field | Detail |
|-------|--------|
| **Goal** | Create and manage contact audiences for campaigns |
| **Trigger** | User navigates to `/workspaces/{id}/audiences` |
| **Steps** | 1. `/audiences` (audience table) → 2. Click "Add Audience" → 3. `/audiences/new` (name + CSV upload) → 4. Upload contacts → 5. View upload history → 6. Click audience row → 7. `/audiences/{audience_id}` (view contacts in audience) |
| **Components** | `AudienceTable`, `AudienceForm`, `AudienceUploader`, `AudienceUploadHistory`, `DataTable` |
| **Actions** | Name audience → Upload CSV → Map columns → View progress → View audience contacts → Add audience to campaign queue |
| **Outcome** | Audience created with contacts; available for campaign queue assignment |
| **Pain points** | • No inline audience creation from the campaigns queue page; must navigate to `/audiences` first.<br>• CSV upload has no preview or validation before processing.<br>• Upload history shows status but no retry action for failed uploads.<br>• Audience detail view has no bulk actions on contacts. |

### 9. Script Management (Standalone)

| Field | Detail |
|-------|--------|
| **Goal** | Create reusable scripts outside of campaign context |
| **Trigger** | User navigates to `/workspaces/{id}/scripts` |
| **Steps** | 1. `/scripts` (script table) → 2. Click "Add a Script" → 3. `/scripts/new` (script editor) → 4. Edit pages/questions → 5. Save → 6. Download as JSON |
| **Components** | `CampaignSettings.Script`, `CampaignSettings.Script.QuestionBlock`, `CampaignSettings.Script.IVRQuestionBlock`, `Result` |
| **Actions** | Name script → Add pages → Add question blocks → Configure options/dispositions → Save → Download JSON |
| **Outcome** | Reusable script created; can be assigned to campaigns |
| **Pain points** | • Script editor is the same component as campaign script editor but with different save behavior (no campaign context).<br>• Download uses a fetcher POST then `downloadBlobPart`, which is inconsistent with other export patterns.<br>• No script versioning or changelog visible to users. |

### 10. Survey Management

| Field | Detail |
|-------|--------|
| **Goal** | Create surveys and collect responses |
| **Trigger** | User navigates to `/workspaces/{id}/surveys` |
| **Steps** | 1. `/surveys` (survey table) → 2. Click "New Survey" → 3. `/surveys/new` (create form) → 4. `/surveys/{surveyId}` (view survey) → 5. `/surveys/{surveyId}/edit` (edit questions) → 6. `/surveys/{surveyId}/responses` (view responses) → 7. `/surveys/{surveyId}/responses/export` (export responses) |
| **Components** | `QuestionCard.ResponseTable.EditModal`, `DataTable`, `WorkspaceResourceListShell` |
| **Actions** | Name survey → Add/edit questions → View responses table → Export to CSV |
| **Outcome** | Survey created with responses collected; data exportable |
| **Pain points** | • Survey creation and editing is separate from the main campaign flow; not obvious how surveys connect to campaigns.<br>• Response export is a separate sub-route; no one-click export from the responses table.<br>• No response analytics or summary stats visible in the responses view. |

### 11. Audio/Voice Drop Management

| Field | Detail |
|-------|--------|
| **Goal** | Upload and manage audio files for voicemail drops and IVR |
| **Trigger** | User navigates to `/workspaces/{id}/audios` |
| **Steps** | 1. `/audios` (audio file table with inline player) → 2. Click "Upload" → 3. `/audios/new` (upload form with file picker) → 4. File is normalized to MP3 via ffmpeg → 5. Audio appears in table |
| **Components** | `DataTable`, `WorkspaceResourceListShell`, inline `<audio controls>` |
| **Actions** | Select file → Upload → Wait for normalization → Play preview |
| **Outcome** | Audio file uploaded and available for campaigns |
| **Pain points** | • Upload only available from `/audios/new`; no inline upload from campaign settings where audio is actually used.<br>• No audio trim or preview editing before save.<br>• ffmpeg normalization is server-side with no progress indicator in UI. |

### 12. Voicemail Review

| Field | Detail |
|-------|--------|
| **Goal** | Listen to voicemail recordings left by contacts |
| **Trigger** | User navigates to `/workspaces/{id}/voicemails` |
| **Steps** | 1. `/voicemails` (audio table with inline players) → 2. Click play on a voicemail |
| **Components** | `DataTable`, inline `<audio controls>` |
| **Actions** | Play voicemail → Sort/filter table → Paginate |
| **Outcome** | User listens to voicemails |
| **Pain points** | • Empty state says "Add a voicemail greeting" but there is no upload button on this page.<br>• No delete, rename, or download actions on voicemails.<br>• Metadata like duration is commented out in column definitions. |

### 13. Team & Invite Management

| Field | Detail |
|-------|--------|
| **Goal** | Invite team members and manage workspace access |
| **Trigger** | User navigates to `/workspaces/{id}/settings` |
| **Steps** | 1. `/settings` (team section) → 2. Enter email + select role → 3. Submit invite → 4. View pending invites → 5. Member accepts via `/accept-invite` or `/admin/workspaces/{id}/invite` (admin) |
| **Components** | `TeamMember`, `InviteCheckbox`, `ExistingUserInvites`, `NewUserSignUp`, `EmailField`, `NameFields`, `PasswordFields` |
| **Actions** | Enter email → Select role (Member/Admin, no Owner) → Submit invite → Accept invitation → Set password (new users) |
| **Outcome** | Team member added to workspace with appropriate role |
| **Pain points** | • Role dropdown excludes "Owner" and conditionally excludes "Admin" based on current user's role, which is not explained in UI.<br>• Truncated user IDs shown instead of names in member lists.<br>• No bulk invite (multiple emails at once).<br>• Invite acceptance for new users requires password setup even after email verification via token. |

### 14. Campaign Export

| Field | Detail |
|-------|--------|
| **Goal** | Export campaign results and queue data |
| **Trigger** | User clicks "Export" from campaign dashboard or navigates to `/workspaces/{id}/exports` |
| **Steps** | 1. Campaign dashboard → Click "Export" (admin only) → 2. Export queued in background → 3. `/exports` (view export table) → 4. Auto-poll every 5s for status → 5. Download completed export |
| **Components** | `AdminAsyncExportButton`, `AsyncExportButton`, `DataTable` |
| **Actions** | Click Export → Wait for processing → Download file → Refresh status |
| **Outcome** | CSV export downloaded with campaign data |
| **Pain points** | • Export trigger is only available from campaign dashboard, not from `/exports` page itself.<br>• 24-hour expiration is hardcoded with no renewal option.<br>• Manual refresh button exists despite auto-polling every 5 seconds.<br>• No export preview or column selection before download. |

### 15. Password Reset / Forgot Password

| Field | Detail |
|-------|--------|
| **Goal** | Recover access when password is forgotten |
| **Trigger** | User clicks "I forgot my password" from `/signin` |
| **Steps** | 1. `/signin` → Click "I forgot my password" → 2. `/remember` (enter email) → 3. Submit → 4. Receive reset email → 5. Click reset link → 6. Set new password |
| **Components** | `AuthCard`, `EmailField` |
| **Actions** | Enter email → Submit → Click email link → Enter new password → Confirm |
| **Outcome** | Password reset; user can sign in with new password |
| **Pain points** | • Not explicitly mapped in the route scan; verify this flow still exists and is functional.<br>• No clear success state after submitting reset request (no "check your email" message visible in route code). |

### 16. API Keys & Webhooks

| Field | Detail |
|-------|--------|
| **Goal** | Configure workspace API keys and webhook endpoints |
| **Trigger** | User navigates to `/workspaces/{id}/settings` and expands API/Webhook section |
| **Steps** | 1. `/settings` → Scroll to API Keys section → 2. Generate/copy API key → 3. Expand Webhook accordion → 4. Configure webhook URL and events → 5. Save |
| **Components** | `ApiKeysSection`, `WebhookEditor` |
| **Actions** | Generate key → Copy to clipboard → Enter webhook URL → Select events → Test webhook → Save |
| **Outcome** | API key generated; webhook configured for workspace events |
| **Pain points** | • API keys are only visible to owners/admins but the UI doesn't explain why callers can't see them.<br>• Webhook test is not available inline; must trigger a real event to verify.<br>• No webhook delivery log or retry status visible. |

### 17. Campaign Archive & Duplication

| Field | Detail |
|-------|--------|
| **Goal** | Archive old campaigns or duplicate existing ones |
| **Trigger** | User navigates to `/workspaces/{id}/campaigns/archive` or clicks "Duplicate" in campaign settings |
| **Steps** | 1. `/campaigns` → Click "Archive" tab → 2. `/campaigns/archive` (view archived campaigns) → 3. Or: Campaign settings → Click "Duplicate" → 4. Confirm duplication → 5. New campaign created with copied settings |
| **Components** | `CampaignList`, `CampaignSettings`, `CampaignDetailed.ActivateButtons` |
| **Actions** | View archive → Select campaign → Unarchive (if needed) → Or duplicate → Configure new campaign → Launch |
| **Outcome** | Archived campaigns hidden from active list; duplicated campaign ready for editing |
| **Pain points** | • Archive tab is easy to miss in the campaign navigation.<br>• Duplication copies settings but doesn't clearly indicate what is/isn't copied (e.g., queue contacts are not duplicated).<br>• No bulk archive/unarchive action. |

### 18. IVR-Specific Flows

| Field | Detail |
|-------|--------|
| **Goal** | Create and manage Interactive Voice Response campaigns |
| **Trigger** | User selects "Interactive Voice Recording" campaign type |
| **Steps** | 1. `/campaigns/new` → Select "IVR" type → 2. `/campaigns/{id}/settings` → Configure IVR settings → 3. `/campaigns/{id}/script/edit` → Build IVR question tree with keypad options → 4. `/campaigns/{id}/queue` → Add contacts → 5. Launch |
| **Components** | `CampaignDetailed.Voicemail`, `CampaignSettings.Script.IVRQuestionBlock`, `VoxTypeSelector` |
| **Actions** | Select IVR type → Configure voice drops → Build question tree with options → Map keypad presses to actions → Add contacts → Launch |
| **Outcome** | IVR campaign running; contacts hear automated questions and press keys to respond |
| **Pain points** | • IVR editor (`IVRQuestionBlock`) is different from live call script editor, creating inconsistency.<br>• No IVR test/simulate mode before launching.<br>• IVR results and analytics are mixed with live call data, making it hard to distinguish.<br>• Voice drop selection is buried in campaign detailed settings, not in the script editor. |

### 19. Message Campaign Specific

| Field | Detail |
|-------|--------|
| **Goal** | Create and manage SMS/MMS message campaigns |
| **Trigger** | User selects "Message" campaign type |
| **Steps** | 1. `/campaigns/new` → Select "Message" type → 2. `/campaigns/{id}/settings` → Configure message settings → 3. `/campaigns/{id}/script/edit` → Write message body + add media links → 4. `/campaigns/{id}/queue` → Add contacts → 5. Launch |
| **Components** | `MessageSettings`, `CampaignDetailed` |
| **Actions** | Select Message type → Write message body → Add media URLs → Configure opt-out handling → Add contacts → Launch |
| **Outcome** | Message campaign running; SMS/MMS sent to queued contacts |
| **Pain points** | • Message campaign uses `MessageSettings` component instead of `CampaignSettings.Script`, creating a disjointed experience.<br>• No message preview or test send before launching.<br>• Media links are plain text URLs; no image preview or validation.<br>• Message scheduling is not available; campaigns send immediately when started. |

### 20. Call Disposition & Results

| Field | Detail |
|-------|--------|
| **Goal** | Review and analyze call outcomes and dispositions |
| **Trigger** | User navigates to campaign dashboard `/campaigns/{id}` (admin view) |
| **Steps** | 1. `/campaigns/{id}` → View `ResultsScreen` with key metrics → 2. Scroll to disposition breakdown → 3. Click export for detailed results → 4. Filter by date range or caller |
| **Components** | `ResultsScreen`, `ResultsScreen.Disposition`, `ResultsScreen.KeyMetrics`, `ResultsScreen.TotalCalls`, `CampaignResultDisplay` |
| **Actions** | View metrics → Filter by disposition → Export detailed results → Review caller performance |
| **Outcome** | Campaign performance analyzed; actionable insights for optimization |
| **Pain points** | • Results screen only shows for admins; callers see `CampaignInstructions` instead.<br>• Disposition names are mapped to Material Design icons via `Result.IconMap.tsx`—inconsistent with Lucide icons used elsewhere.<br>• No drill-down from disposition summary to individual call records.<br>• Results are campaign-scoped; no cross-campaign comparison view. |

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
| Contact creation not available from `/contacts` route | **Medium** | 7 | Campaign managers |
| No quick-action to call/SMS from contact detail | **Medium** | 7 | Campaign managers |
| CSV upload has no preview or validation | **Medium** | 8 | Campaign managers |
| No inline audience creation from campaign queue | **Medium** | 8 | Campaign managers |
| Script save behavior differs between standalone and campaign context | **Medium** | 9 | Campaign managers |
| Survey creation disconnected from campaign flow | **Medium** | 10 | Campaign managers |
| No audio upload from campaign settings where audio is used | **Medium** | 11 | Campaign managers |
| Invite acceptance requires password after email verification | **Medium** | 13 | All new users |
| Export trigger not available from `/exports` page | **Medium** | 14 | Campaign managers |
| IVR editor inconsistent with live call script editor | **Medium** | 18 | Campaign managers |
| No message preview or test send before launch | **Medium** | 19 | Campaign managers |
| Results only visible to admins; callers see instructions | **Medium** | 20 | Campaign managers |
| System status hardcoded in admin dashboard | **Low** | 5 | System admins |
| Voicemails page has no upload CTA | **Low** | 12 | Campaign managers |
| Voicemails have no delete/rename/download actions | **Low** | 12 | Campaign managers |
| Analytics has no date picker visible in route | **Low** | — | Campaign managers |
| Exports page cannot trigger exports | **Low** | — | Campaign managers |
| Truncated user IDs shown instead of names | **Low** | 5, 13 | All users |
| No audio trim or preview editing | **Low** | 11 | Campaign managers |
| No script versioning or changelog | **Low** | 9 | Campaign managers |
| No bulk invite (multiple emails) | **Low** | 13 | Campaign managers |
| No IVR test/simulate mode | **Low** | 18 | Campaign managers |
| Message scheduling not available | **Low** | 19 | Campaign managers |
| No cross-campaign comparison view | **Low** | 20 | Campaign managers |

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
| **Should** | As a campaign manager, I want to create contacts directly from the contacts page, so that I don't have to upload a CSV or add them through a campaign queue. |
| **Should** | As a campaign manager, I want CSV upload to show a preview and validation errors before processing, so that I can fix issues before importing. |
| **Should** | As a campaign manager, I want to upload audio files directly from campaign settings where I select voice drops, so that I don't have to navigate to a separate audio page. |
| **Should** | As a campaign manager, I want to preview or test-send a message before launching a message campaign, so that I can verify content and formatting. |
| **Could** | As a campaign manager, I want to upload a voicemail greeting directly from the voicemails page, so that I don't have to hunt for the upload action elsewhere. |
| **Could** | As a campaign manager, I want to filter analytics by date range, so that I can review performance for specific periods. |
| **Could** | As a system admin, I want the admin dashboard to show real system health metrics, so that I can spot issues without manually checking Twilio. |
| **Could** | As a campaign manager, I want an IVR test/simulate mode, so that I can verify my question tree before launching to real contacts. |
| **Could** | As a campaign manager, I want to schedule message campaigns for a specific time, so that I can send messages during optimal hours. |
| **Could** | As a campaign manager, I want to see a cross-campaign comparison view, so that I can compare performance across multiple campaigns. |
| **Could** | As a workspace owner, I want to invite multiple team members at once, so that I can onboard my team faster. |
| **Could** | As a campaign manager, I want script versioning, so that I can see what changed and revert to previous versions. |

---

*Generated by user-journey-mapping skill.*

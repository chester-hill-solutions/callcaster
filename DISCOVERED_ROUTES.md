# Discovered Routes - CallCaster Application

This document lists all route files discovered by crawling the application starting from `_index.tsx`.

## Public Routes (Unauthenticated)

### Landing & Marketing
- `_index.tsx` - Home page (landing page)
- `signup.tsx` - User signup page
- `signin.tsx` - User signin/login page
- `login.tsx` - Redirects to signin
- `pricing.tsx` - Pricing information page
- `services.tsx` - Services page
- `other-services.tsx` - Other services page
- `remember.tsx` - Password reset request page
- `reset.tsx` - Password reset page
- `reset-password.tsx` - Password reset form page

### Survey Routes (Public)
- `survey.$surveyId.tsx` - Public survey page

### Authentication Callbacks
- `api.auth.callback.tsx` - OAuth/auth callback handler
- `accept-invite.tsx` - Accept workspace invitation

### Payment
- `confirm-payment.tsx` - Payment confirmation page

## API Routes

### Contact & Forms
- `api.contact-form.tsx` - Contact form submission handler
- `api.contacts.tsx` - Contacts API endpoint
- `api.contact-audience.tsx` - Contact-audience relationship API
- `api.contact-audience.bulk-delete.tsx` - Bulk delete contacts from audience

### Campaign APIs
- `api.campaigns.tsx` - Campaign CRUD operations
- `api.campaign_queue.tsx` - Campaign queue management
- `api.campaign_audience.tsx` - Campaign-audience relationship API
- `api.campaign-export.tsx` - Campaign data export
- `api.campaign-export-status.tsx` - Campaign export status check

### Audience APIs
- `api.audiences.tsx` - Audience CRUD operations
- `api.audience-upload.tsx` - Audience file upload handler
- `api.audience-upload-status.tsx` - Audience upload status check

### Call & Dialing APIs
- `api.dial.jsx` - Initiate phone call
- `api.dial.$number.jsx` - Dial specific number
- `api.dial.status.tsx` - Call status check
- `api.call.jsx` - Call operations
- `api.call-status.jsx` - Call status updates
- `api.hangup.jsx` - Hangup call
- `api.disconnect.jsx` - Disconnect call
- `api.connect-phone-device.tsx` - Connect phone device
- `api.connect-campaign-conference.$workspaceId.$campaignId.tsx` - Connect to campaign conference

### Auto Dialer APIs
- `api.auto-dial.tsx` - Auto dial operations
- `api.auto-dial.$roomId.tsx` - Auto dial room operations
- `api.auto-dial.dialer.tsx` - Dialer operations
- `api.auto-dial.status.tsx` - Auto dial status
- `api.auto-dial.end.tsx` - End auto dial session

### IVR (Interactive Voice Response) APIs
- `api.ivr.tsx` - IVR operations
- `api.ivr.status.tsx` - IVR status check
- `api.ivr.$campaignId.$pageId.tsx` - IVR page handler
- `api.ivr.$campaignId.$pageId.$blockId.tsx` - IVR block handler
- `api.ivr.$campaignId.$pageId.$blockId.response.tsx` - IVR response handler
- `api.initiate-ivr.jsx` - Initiate IVR flow
- `old.api.ivr.$campaignId.jsx` - Legacy IVR handler
- `old.api.ivr.$campaignId.$pageId.tsx` - Legacy IVR page handler
- `old.api.ivr.$campaignId.$pageId.$outreachId.tsx` - Legacy IVR outreach handler

### SMS/Chat APIs
- `api.sms.tsx` - SMS operations
- `api.sms.status.tsx` - SMS status check
- `api.chat_sms.tsx` - Chat/SMS messaging
- `api.inbound-sms.tsx` - Inbound SMS handler
- `api.inbound.tsx` - Inbound call handler

### Audio & Media APIs
- `api.audiodrop.tsx` - Audio drop operations
- `api.media.jsx` - Media operations
- `api.message_media.jsx` - Message media operations
- `api.recording.tsx` - Recording operations
- `api.email-vm.tsx` - Email voicemail handler

### Phone Number & Caller ID APIs
- `api.numbers.jsx` - Phone number operations
- `api.caller-id.tsx` - Caller ID operations
- `api.caller-id.status.tsx` - Caller ID status

### Verification APIs
- `api.verify-pin-input.tsx` - PIN verification
- `api.verify-audio-pin.$pin.tsx` - Audio PIN verification
- `api.verify-audio-session.tsx` - Audio session verification

### Survey APIs
- `api.surveys.tsx` - Survey CRUD operations
- `api.survey-answer.tsx` - Survey answer submission
- `api.survey-complete.tsx` - Survey completion handler
- `api.survey-responses.tsx` - Survey responses retrieval

### Script APIs
- `api.scripts.tsx` - Script CRUD operations

### Queue APIs
- `api.queues.jsx` - Queue operations

### Outreach APIs
- `api.outreach-attempts.jsx` - Outreach attempts
- `api.outreach_attempts.$id.js` - Specific outreach attempt

### Questions API
- `api.questions.jsx` - Questions operations

### Workspace APIs
- `api.workspace.jsx` - Workspace operations

### Token API
- `api.token.jsx` - Token operations

### Campaign Reset API
- `api.reset_campaign.tsx` - Reset campaign

### Webhook & Testing APIs
- `api.test-webhook.tsx` - Webhook testing

### Error Reporting API
- `api.error-report.tsx` - Error reporting

## Authenticated Routes

### Dashboard
- `dashboard.tsx` - Main dashboard
- `dashboard.$id.jsx` - Specific dashboard view

### Workspaces

#### Workspace List & Management
- `workspaces.tsx` - Workspace list page
- `workspaces_.$id.tsx` - Workspace detail/home page

#### Workspace Settings
- `workspaces_.$id.settings.tsx` - Workspace settings
- `workspaces_.$id_.settings_.numbers.tsx` - Workspace phone number settings
- `workspaces_.$id.billing.tsx` - Workspace billing/credits

#### Workspace Campaigns
- `workspaces_.$id.campaigns.tsx` - Campaign list (nested route handler)
- `workspaces_.$id.campaigns_.new.tsx` - Create new campaign
- `workspaces_.$id.campaigns.$selected_id.tsx` - Campaign detail page
- `workspaces_.$id.campaigns.$selected_id.settings.tsx` - Campaign settings
- `workspaces_.$id.campaigns.$selected_id.script.edit.tsx` - Edit campaign script
- `workspaces_.$id.campaigns.$selected_id.queue.tsx` - Campaign queue
- `workspaces_.$id.campaigns.$campaign_id.call.tsx` - Campaign call screen
- `workspaces_.$id.campaigns.$campaign_id.audiences.new.tsx` - Add audience to campaign
- `workspaces_.$id.campaigns.archive.tsx` - Archived campaigns

#### Workspace Audiences
- `workspaces_.$id.audiences.tsx` - Audience list
- `workspaces_.$id.audiences_.new.tsx` - Create new audience
- `workspaces_.$id.audiences_.$audience_id.tsx` - Audience detail

#### Workspace Scripts
- `workspaces_.$id.scripts.tsx` - Script list
- `workspaces_.$id.scripts_.new.tsx` - Create new script
- `workspaces_.$id.scripts_.$scriptId.tsx` - Script detail/edit

#### Workspace Audio
- `workspaces_.$id.audios.tsx` - Audio file list
- `workspaces_.$id.audios_.new.tsx` - Upload new audio

#### Workspace Contacts
- `workspaces_.$id_.contacts.tsx` - Contact list
- `workspaces_.$id.contacts_.$contactId.tsx` - Contact detail

#### Workspace Chats
- `workspaces_.$id.chats.tsx` - Chat list/conversations
- `workspaces_.$id.chats.$contact_number.tsx` - Individual chat conversation

#### Workspace Surveys
- `workspaces_.$id.surveys.tsx` - Survey list
- `workspaces_.$id.surveys_.new.tsx` - Create new survey
- `workspaces_.$id.surveys_.$surveyId.tsx` - Survey detail
- `workspaces_.$id.surveys_.$surveyId.edit.tsx` - Edit survey
- `workspaces_.$id.surveys_.$surveyId_.responses.tsx` - Survey responses
- `workspaces_.$id.surveys_.$surveyId_.responses.export.tsx` - Export survey responses

#### Workspace Exports
- `workspaces_.$id.exports.tsx` - Export management

#### Workspace Voicemails
- `workspaces_.$id.voicemails.tsx` - Voicemail list

## Admin Routes

### Admin Dashboard
- `admin.tsx` - Admin dashboard
- `admin.fixed.tsx` - Admin fixed page

### Admin User Management
- `admin_.users.$userId.edit.tsx` - Edit user
- `admin_.users.$userId.workspaces.tsx` - User workspaces

### Admin Workspace Management
- `admin_.workspaces.$workspaceId.tsx` - Workspace admin view
- `admin_.workspaces.$workspaceId.campaigns.tsx` - Workspace campaigns admin
- `admin_.workspaces.$workspaceId.users.tsx` - Workspace users admin
- `admin_.workspaces.$workspaceId.twilio.tsx` - Workspace Twilio settings
- `admin_.workspaces.$workspaceId_.invite.tsx` - Workspace invitation admin

## Route Discovery Path

The routes were discovered by following navigation links starting from `_index.tsx`:

1. **Starting Point**: `_index.tsx`
   - Links to: `signup.tsx`, `/api/contact-form`

2. **From signup.tsx**:
   - Links to: `/api/contact-form`
   - Redirects to: `/workspaces` (after signup)

3. **From signin.tsx**:
   - Links to: `signup.tsx`, `remember.tsx`
   - Redirects to: `/workspaces` (after login)

4. **From root.tsx (Navbar)**:
   - Links to: `/pricing`, `/signin`, `/signup`, `/workspaces`, `/accept-invite`, `/workspaces/${id}/settings`

5. **From workspaces.tsx**:
   - Links to: `/workspaces/${id}`

6. **From workspaces_.$id.tsx**:
   - Uses WorkspaceNav component which links to:
     - `/workspaces/${id}` (home)
     - `/workspaces/${id}/chats`
     - `/workspaces/${id}/scripts`
     - `/workspaces/${id}/audios`
     - `/workspaces/${id}/audiences`
     - `/workspaces/${id}/exports`
     - `/workspaces/${id}/settings`
     - `/workspaces/${id}/billing`

7. **From CampaignList component**:
   - Links to: `campaigns/new`, `campaigns/${id}`, `campaigns/archive`

8. **From CampaignNav component**:
   - Links to campaign sub-routes like settings, queue, etc.

## Notes

- Routes prefixed with `api.` are API endpoints, not page routes
- Routes with `$` indicate dynamic parameters (e.g., `$id`, `$selected_id`)
- Routes with `_` indicate optional segments in Remix routing
- Some routes have both `.tsx` and `.jsx` extensions (legacy code)
- Old/legacy routes are prefixed with `old.`

## Total Route Count

- **Public Routes**: ~15
- **API Routes**: ~70+
- **Authenticated Workspace Routes**: ~30+
- **Admin Routes**: ~7
- **Total**: ~120+ route files


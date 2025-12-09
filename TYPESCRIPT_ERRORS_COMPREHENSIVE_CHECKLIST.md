# TypeScript Type Errors - Comprehensive Checklist

**Status**: ~390 errors remaining (down from ~410)  
**Last Updated**: 2024-12-19  
**Progress**: ~5% complete (20+ files fixed)

---

## Table of Contents

1. [Overview](#overview)
2. [Priority Levels](#priority-levels)
3. [Files by Category](#files-by-category)
4. [Common Error Patterns](#common-error-patterns)
5. [Quick Reference Guide](#quick-reference-guide)
6. [Progress Tracking](#progress-tracking)

---

## Overview

This comprehensive checklist tracks all TypeScript type errors across the codebase. Errors are organized by:
- **Category**: Components, Routes, Hooks, Lib files
- **Priority**: Critical, High, Medium, Low
- **Pattern**: Common error types (implicit any, Json access, null handling, etc.)
- **Complexity**: Simple, Medium, Complex

### Error Distribution

- **Components**: ~150 errors (38%)
- **Routes**: ~120 errors (31%)
- **Hooks**: ~60 errors (15%)
- **Lib/Utils**: ~30 errors (8%)
- **Supabase Edge Functions**: ~30 errors (8%) - Lower priority (Deno-specific)

---

## Priority Levels

### 🔴 Critical Priority
- Errors that break functionality or cause runtime crashes
- API route errors affecting production
- Type mismatches in core data flows

### 🟠 High Priority
- Component prop type errors affecting UI
- Route handler type errors
- Missing null checks causing potential crashes

### 🟡 Medium Priority
- Implicit `any` types in callbacks
- Json type access issues
- FormDataEntryValue handling

### 🟢 Low Priority
- Supabase Edge Functions (Deno-specific)
- Console.log statements
- Minor type assertions

---

## Files by Category

### Priority 1: Component Files (~150 errors)

#### CallScreen Components ✅ (Mostly Complete)

- [x] `app/components/call/CallScreen.Dialogs.tsx` ✅
- [x] `app/components/call/CallScreen.Questionnaire.tsx` ✅
- [x] `app/components/call/CallScreen.QueueList.tsx` ✅
- [x] `app/components/call/CallScreen.CallArea.tsx` ✅
- [ ] `app/components/call/CallScreen.Household.tsx` - Check for implicit any types
- [ ] `app/components/call/CallScreen.Header.tsx` - Check for prop type issues
- [ ] `app/components/call/CallScreen.TopBar.jsx` - Migrate to TypeScript

#### Campaign Settings Components ✅ (Mostly Complete)

- [x] `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx` ✅
- [x] `app/components/campaign/settings/basic/CampaignBasicInfo.SelectStatus.tsx` ✅
- [x] `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx` ✅
- [x] `app/components/campaign/settings/basic/CampaignBasicInfo.tsx` ✅
- [x] `app/components/campaign/settings/CampaignSettings.tsx` ✅
- [x] `app/components/campaign/settings/detailed/CampaignDetailed.SelectScript.tsx` ✅
- [x] `app/components/campaign/settings/detailed/CampaignDetailed.Voicemail.tsx` ✅
- [x] `app/components/campaign/settings/detailed/live/CampaignDetailed.Live.SelectVoiceDrop.tsx` ✅
- [x] `app/components/campaign/settings/detailed/live/CampaignDetailed.Live.Switches.tsx` ✅
- [x] `app/components/campaign/settings/script/CampaignSettings.Script.IVRQuestionBlock.tsx` ✅
- [x] `app/components/campaign/settings/script/CampaignSettings.Script.QuestionBlock.tsx` ✅
- [ ] `app/components/campaign/settings/script/CampaignSettings.Script.tsx` - Check for any types
- [ ] `app/components/campaign/settings/detailed/CampaignDetailed.tsx` - Check for prop types

#### Campaign Home Components ✅

- [x] `app/components/campaign/home/CampaignHomeScreen/CampaignNav.tsx` ✅

#### Chat Components ✅ (Complete)

- [x] `app/components/chat/ChatAddContactDialog.tsx` ✅
- [x] `app/components/chat/ChatHeader.tsx` ✅
- [x] `app/components/chat/ChatImages.tsx` ✅
- [x] `app/components/chat/ChatMessages.tsx` ✅

#### Audience Components

- [ ] `app/components/audience/AudienceTable.tsx` - Check for implicit any types
- [ ] `app/components/audience/AudienceUploader.tsx` - Check for FormDataEntryValue handling
- [ ] `app/components/audience/AudienceUploadHistory.tsx` - Check for prop types
- [ ] `app/components/audience/AudienceContactRow.jsx` - Migrate to TypeScript
- [ ] `app/components/audience/AudienceForm.tsx` - Check for prop types

#### Contact Components

- [ ] `app/components/contact/ContactDetails.tsx` - Check for prop types
- [ ] `app/components/contact/ContactDetailsFields.tsx` - Check for prop types
- [ ] `app/components/contact/ContactDetailsOtherFields.tsx` - Check for any types
- [ ] `app/components/contact/ContactForm.tsx` - Check for FormDataEntryValue handling
- [ ] `app/components/contact/ContactTable.tsx` - Check for implicit any types
- [ ] `app/components/contact/RecentContacts.tsx` - Check for prop types

#### Queue Components

- [ ] `app/components/queue/QueueContent.tsx` - Check for prop types and any usage

#### Call List Components

- [ ] `app/components/call-list/CallList/CallContact/Result.tsx` - Check for prop types

#### Script Components

- [ ] `app/components/script/ScriptBlock.tsx` - Check for any types (3 instances found)

#### Question Components

- [ ] `app/components/question/QuestionCard.ResponseTable.jsx` - Migrate to TypeScript, fix any types
- [ ] `app/components/question/QuestionCard.ResponseTable.EditModal.jsx` - Migrate to TypeScript, fix any types (2 instances)

#### Settings Components

- [ ] `app/components/settings/MessageSettings.jsx` - Migrate to TypeScript, fix any types

#### Other Components ✅ (Mostly Complete)

- [x] `app/components/OtherServices/ServiceCard.tsx` ✅
- [x] `app/components/Workspace/WorkspaceNav.tsx` ✅
- [x] `app/components/Workspace/WorkspaceTable/columns.tsx` ✅
- [x] `app/components/invite/AcceptInvite/ExistingUserInvites.tsx` ✅
- [x] `app/components/Workspace/WorkspaceOverview.tsx` ✅
- [x] `app/components/phone-numbers/NumberPurchase.tsx` ✅

---

### Priority 2: Route Files (~120 errors)

#### Workspace Routes

- [x] `app/routes/workspaces_.$id.scripts_.new.tsx` ✅
- [ ] `app/routes/workspaces_.$id.scripts.tsx` - Check for any types (2 instances)
- [ ] `app/routes/workspaces_.$id.scripts_.$scriptId.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.chats.tsx` - Check for any types (2 instances)
- [ ] `app/routes/workspaces_.$id.chats.$contact_number.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.campaigns.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.campaigns.$selected_id.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.campaigns.$selected_id.settings.tsx` - Check for any types (2 instances)
- [ ] `app/routes/workspaces_.$id.campaigns.$selected_id.queue.tsx` - Check for any types (2 instances)
- [ ] `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx` - Check for any types
- [ ] `app/routes/workspaces_.$id_.contacts.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.contacts_.$contactId.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.settings.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.audiences.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.audiences_.$audience_id.tsx` - Check for any types
- [ ] `app/routes/workspaces_.$id.audiences_.new.tsx` - Check for any types
- [ ] `app/routes/workspaces_.$id.audios.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.audios_.new.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.voicemails.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.exports.tsx` - Check for any types
- [ ] `app/routes/workspaces_.$id.surveys_.$surveyId.tsx` - Check for any types (4 instances)
- [ ] `app/routes/workspaces_.$id.surveys_.$surveyId_.responses.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.surveys_.$surveyId_.responses.export.tsx` - Check for prop types
- [ ] `app/routes/workspaces_.$id.surveys_.new.tsx` - Check for prop types
- [x] `app/routes/workspaces_.$id_.settings_.numbers.tsx` ✅

#### API Routes ✅ (Mostly Complete)

- [x] `app/routes/api.dial.status.tsx` ✅
- [x] `app/routes/api.ivr.$campaignId.$pageId.$blockId.response.tsx` ✅
- [x] `app/routes/api.ivr.status.tsx` ✅
- [x] `app/routes/api.sms.status.tsx` ✅
- [x] `app/routes/api.surveys.tsx` ✅
- [x] `app/routes/api.auto-dial.dialer.tsx` ✅
- [x] `app/routes/api.auto-dial.end.tsx` ✅
- [x] `app/routes/api.disconnect.ts` ✅
- [ ] `app/routes/api.ivr.$campaignId.$pageId.$blockId.tsx` - Check for prop types
- [ ] `app/routes/api.ivr.$campaignId.$pageId.tsx` - Check for prop types
- [ ] `app/routes/api.ivr.tsx` - Check for any types
- [ ] `app/routes/api.auto-dial.tsx` - Check for prop types
- [ ] `app/routes/api.auto-dial.$roomId.tsx` - Check for prop types
- [ ] `app/routes/api.auto-dial.status.tsx` - Check for any types
- [ ] `app/routes/api.contacts.tsx` - Check for prop types
- [ ] `app/routes/api.campaigns.tsx` - Check for prop types
- [ ] `app/routes/api.campaign_queue.tsx` - Check for any types
- [ ] `app/routes/api.campaign_audience.tsx` - Check for prop types
- [ ] `app/routes/api.campaign-export.tsx` - Check for prop types
- [ ] `app/routes/api.audience-upload.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/api.audiences.tsx` - Check for prop types
- [ ] `app/routes/api.audiodrop.tsx` - Check for prop types
- [ ] `app/routes/api.caller-id.tsx` - Check for prop types
- [ ] `app/routes/api.connect-phone-device.tsx` - Check for any types
- [ ] `app/routes/api.inbound.tsx` - Check for prop types
- [ ] `app/routes/api.inbound-sms.tsx` - Check for any types
- [ ] `app/routes/api.verify-audio-session.tsx` - Check for any types
- [ ] `app/routes/api.email-vm.tsx` - Check for prop types
- [ ] `app/routes/api.reset_campaign.tsx` - Check for prop types
- [ ] `app/routes/api.survey-answer.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/api.survey-complete.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/api.survey-responses.tsx` - Check for prop types
- [ ] `app/routes/api.contact-audience.tsx` - Check for prop types
- [ ] `app/routes/api.contact-audience.bulk-delete.tsx` - Check for prop types
- [ ] `app/routes/api.auth.callback.tsx` - Check for prop types
- [ ] `app/routes/old.api.ivr.$campaignId.$pageId.$outreachId.tsx` - Check for any types

#### Admin Routes ✅ (Mostly Complete)

- [x] `app/routes/admin_.workspaces.$workspaceId_.invite.tsx` ✅
- [x] `app/routes/admin_.users.$userId.workspaces.tsx` ✅
- [ ] `app/routes/admin_.workspaces.$workspaceId.tsx` - Check for prop types
- [ ] `app/routes/admin_.workspaces.$workspaceId.twilio.tsx` - Check for any types
- [ ] `app/routes/admin_.users.$userId.edit.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/admin.tsx` - Check for prop types
- [ ] `app/routes/admin.fixed.tsx` - Check for prop types

#### Other Routes ✅ (Mostly Complete)

- [x] `app/routes/signup.tsx` ✅
- [x] `app/routes/remember.tsx` ✅
- [x] `app/routes/services.tsx` ✅
- [x] `app/routes/other-services.tsx` ✅
- [x] `app/routes/accept-invite.tsx` ✅
- [x] `app/routes/survey.$surveyId.tsx` ✅
- [ ] `app/routes/signin.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/reset-password.tsx` - Check for FormDataEntryValue handling
- [ ] `app/routes/workspaces.tsx` - Check for prop types

---

### Priority 3: Hooks (~60 errors)

#### Call Hooks

- [ ] `app/hooks/call/useSupabaseRoom.ts` - Check for implicit any types
- [ ] `app/hooks/call/useTwilioConnection.ts` - Check for implicit any types
- [ ] `app/hooks/call/useCallHandling.ts` - Check for implicit any types
- [ ] `app/hooks/call/useCallState.ts` - Check for implicit any types
- [ ] `app/hooks/call/useStartConferenceAndDial.ts` - Check for implicit any types
- [ ] `app/hooks/call/useTwilioDevice.ts` - Check for implicit any types
- [ ] `app/hooks/call/useCallDuration.ts` - Check for implicit any types
- [ ] `app/hooks/call/index.ts` - Check for export types

#### Queue Hooks

- [ ] `app/hooks/queue/useQueue.ts` - Check for implicit any types
- [ ] `app/hooks/queue/useCalls.ts` - Check for any types
- [ ] `app/hooks/queue/useAttempts.ts` - Check for any types
- [ ] `app/hooks/queue/index.ts` - Check for export types

#### Realtime Hooks

- [ ] `app/hooks/realtime/useSupabaseRealtime.ts` - Check for any types (3 instances)
- [ ] `app/hooks/realtime/useChatRealtime.ts` - Check for any types
- [ ] `app/hooks/realtime/useRealtimeData.ts` - Check for implicit any types

#### Campaign Hooks

- [ ] `app/hooks/campaign/useCampaignSettings.ts` - Check for any types
- [ ] `app/hooks/campaign/useScriptState.ts` - Check for implicit any types
- [ ] `app/hooks/campaign/index.ts` - Check for export types

#### Contact Hooks

- [ ] `app/hooks/contact/useContactSearch.ts` - Check for any types
- [ ] `app/hooks/contact/index.ts` - Check for export types

#### Phone Hooks

- [ ] `app/hooks/phone/usePhoneNumbers.ts` - Check for implicit any types
- [ ] `app/hooks/phone/index.ts` - Check for export types

#### Utils Hooks

- [ ] `app/hooks/utils/useDebounce.ts` - Check for any types
- [ ] `app/hooks/utils/useDebouncedSave.ts` - Check for implicit any types
- [ ] `app/hooks/utils/useIntersectionObserver.ts` - Check for implicit any types
- [ ] `app/hooks/utils/useInterval.ts` - Check for implicit any types
- [ ] `app/hooks/utils/index.ts` - Check for export types

---

### Priority 4: Lib/Utils Files (~30 errors)

- [ ] `app/lib/utils.ts` - Check for any types
- [ ] `app/lib/csv.ts` - Check for implicit any types
- [ ] `app/lib/csvDownload.ts` - Check for implicit any types
- [ ] `app/lib/callscreenActions.ts` - Check for implicit any types
- [ ] `app/lib/twilio.server.ts` - Check for any types
- [ ] `app/lib/utils/phone.ts` - Check for implicit any types
- [ ] `app/lib/services/api.ts` - Check for implicit any types
- [ ] `app/lib/services/hooks-api.ts` - Check for implicit any types
- [ ] `app/lib/WorkspaceSettingUtils/WorkspaceSettingUtils.ts` - Check for implicit any types
- [x] `app/lib/database/workspace.server.ts` ✅
- [ ] `app/lib/env.server.ts` - Check for any types
- [ ] `app/sessions.server.tsx` - Check for prop types

---

### Priority 5: Supabase Edge Functions (~30 errors) - Lower Priority

**Note**: These are Deno-specific and may need separate handling or tsconfig exclusion.

#### Common Issues Across All Edge Functions:

- [ ] **58 errors**: `Cannot find name 'Deno'`
  - Files: All files in `supabase/functions/`
  - Action: Add Deno type definitions or exclude from TypeScript checking
  - Solution: Add `/// <reference types="https://deno.land/x/types/index.d.ts" />` or exclude in tsconfig

- [ ] **15 errors**: `Cannot find module 'npm:@supabase/supabase-js@^2.39.6'`
  - Files: Multiple edge function files
  - Action: Add proper type declarations or use import map
  - Solution: Create `deno.json` with import map or add type declarations

- [ ] **12 errors**: `Parameter 'req' implicitly has an 'any' type`
  - Files: Multiple edge function files
  - Action: Add type: `req: Request`
  - Solution: `async function handler(req: Request) { ... }`

- [ ] **20 errors**: `Parameter 'supabase' implicitly has an 'any' type`
  - Files: Multiple edge function files
  - Action: Add type: `supabase: SupabaseClient<Database>`
  - Solution: Import types and add proper annotation

- [ ] **12 errors**: `'error' is of type 'unknown'`
  - Files: Multiple edge function files
  - Action: Add type guard: `error instanceof Error`
  - Solution: `catch (error) { if (error instanceof Error) { ... } }`

#### Specific Edge Function Files:

- [ ] `supabase/functions/call-server/index.ts`
- [ ] `supabase/functions/cancel_calls/index.ts`
- [ ] `supabase/functions/create_schedule_jobs/index.ts`
- [ ] `supabase/functions/dequeue_contacts/index.ts`
- [ ] `supabase/functions/handle_active_change/index.ts`
- [ ] `supabase/functions/invite-user-by-email/index.ts`
- [ ] `supabase/functions/ivr-flow/index.ts`
- [ ] `supabase/functions/ivr-handler/index.ts`
- [ ] `supabase/functions/ivr-recording/index.ts`
- [ ] `supabase/functions/ivr-status/index.ts`
- [ ] `supabase/functions/outreach-attempt-hook/index.ts`
- [ ] `supabase/functions/process-audience-upload/index.ts`
- [ ] `supabase/functions/process-ivr/index.ts`
- [ ] `supabase/functions/queue-next/index.ts`
- [ ] `supabase/functions/sms-handler/index.ts`
- [ ] `supabase/functions/sms-status/index.ts`
- [ ] `supabase/functions/update_audience_membership/index.ts`
- [ ] `supabase/functions/update_queue_by_campaign_audience/index.ts`

---

## Common Error Patterns

### Pattern 1: Implicit `any` Types (~200+ errors)

**Symptoms:**
- `Parameter 'X' implicitly has an 'any' type`
- `Binding element 'X' implicitly has an 'any' type`
- `Variable 'X' implicitly has an 'any' type`

**Common Locations:**
- Function parameters
- Component props
- Callback parameters
- Event handlers
- Array methods (map, filter, reduce)

**Solution:**
```typescript
// Before
const handler = (param) => { ... }

// After
const handler = (param: string) => { ... }

// For component props
interface ComponentProps {
  value: string;
  onChange: (value: string) => void;
}
```

**Files Affected:** ~150+ files

---

### Pattern 2: Json Type Access (~30 errors)

**Symptoms:**
- `Property 'X' does not exist on type 'Json'`
- `Type 'Json' is not assignable to type 'X'`

**Common Locations:**
- Supabase Json columns
- Script steps
- Campaign configuration
- Survey responses

**Solution:**
```typescript
// Before
const data = jsonValue.property;

// After
const data = (jsonValue as unknown) as ExpectedType;
// Or with type guard
if (jsonValue && typeof jsonValue === 'object' && 'property' in jsonValue) {
  const data = jsonValue.property;
}
```

**Files Affected:** ~25 files

---

### Pattern 3: Null/Undefined Handling (~25 errors)

**Symptoms:**
- `Object is possibly 'null'`
- `Object is possibly 'undefined'`
- `Argument of type 'X | null' is not assignable to parameter of type 'X'`

**Common Locations:**
- Database query results
- Form data
- URL parameters
- Optional props

**Solution:**
```typescript
// Before
const value = nullableValue.property;

// After
const value = nullableValue?.property ?? defaultValue;
// Or with type guard
if (nullableValue !== null && nullableValue !== undefined) {
  const value = nullableValue.property;
}
```

**Files Affected:** ~20 files

---

### Pattern 4: FormDataEntryValue Handling (~15 errors)

**Symptoms:**
- `Argument of type 'FormDataEntryValue | null' is not assignable to parameter of type 'string'`
- `Type 'FormDataEntryValue' is not assignable to type 'File'`

**Common Locations:**
- Route actions
- Form submissions
- File uploads

**Solution:**
```typescript
// Before
const value = formData.get('key');
const file = formData.get('file') as File;

// After
const valueRaw = formData.get('key');
const value = typeof valueRaw === 'string' ? valueRaw : '';

const fileRaw = formData.get('file');
const file = fileRaw instanceof File ? fileRaw : null;
```

**Files Affected:** ~12 files

---

### Pattern 5: Array Access Without Checks (~10 errors)

**Symptoms:**
- `Object is possibly 'undefined'`
- Array index access without length check

**Solution:**
```typescript
// Before
const item = array[0];

// After
const item = array && array.length > 0 ? array[0] : null;
// Or
if (array && array.length > 0) {
  const item = array[0];
}
```

**Files Affected:** ~8 files

---

### Pattern 6: Type Assertions Without Validation (~10 errors)

**Symptoms:**
- Unsafe `as` casts
- Double assertions `as unknown as Type`

**Solution:**
```typescript
// Before
const data = value as ExpectedType;

// After
// Add runtime validation or type guard
if (isExpectedType(value)) {
  const data = value;
}
```

**Files Affected:** ~8 files

---

## Quick Reference Guide

### Type Fix Templates

#### Fix Implicit Any in Function Parameters
```typescript
// Function
function handler(param: string, callback: (value: number) => void) { ... }

// Arrow function
const handler = (param: string, callback: (value: number) => void) => { ... }

// Component props
interface Props {
  value: string;
  onChange: (value: string) => void;
}
const Component = ({ value, onChange }: Props) => { ... }
```

#### Fix Json Type Access
```typescript
// Single assertion
const data = (jsonValue as unknown) as ExpectedType;

// With type guard
function isExpectedType(value: unknown): value is ExpectedType {
  return typeof value === 'object' && value !== null && 'property' in value;
}

if (isExpectedType(jsonValue)) {
  const data = jsonValue;
}
```

#### Fix Null/Undefined Handling
```typescript
// Optional chaining with default
const value = nullableValue?.property ?? defaultValue;

// Type guard
if (nullableValue !== null && nullableValue !== undefined) {
  const value = nullableValue.property;
}

// Array access
const item = array && array.length > 0 ? array[0] : null;
```

#### Fix FormDataEntryValue
```typescript
// String value
const valueRaw = formData.get('key');
const value = typeof valueRaw === 'string' ? valueRaw : '';

// File value
const fileRaw = formData.get('file');
const file = fileRaw instanceof File ? fileRaw : null;

// Number value
const numberRaw = formData.get('number');
const number = typeof numberRaw === 'string' ? Number(numberRaw) : 0;
```

#### Fix Error Handling
```typescript
try {
  // code
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Progress Tracking

### Completed ✅ (20+ files)

**Components:**
- CallScreen components (4 files)
- Campaign settings components (10 files)
- Chat components (4 files)
- Other components (6 files)

**Routes:**
- API routes (8 files)
- Workspace routes (1 file)
- Other routes (5 files)

**Lib:**
- Database utilities (1 file)

**Total:** ~24 files fixed, ~50+ errors resolved

---

### In Progress 🔄

- Additional component prop types as discovered
- Route file FormDataEntryValue handling
- Hook type annotations

---

### Remaining ⏳ (~390 errors)

**By Priority:**
- 🔴 Critical: ~20 errors
- 🟠 High: ~80 errors
- 🟡 Medium: ~200 errors
- 🟢 Low: ~90 errors (including Edge Functions)

**By Category:**
- Components: ~150 errors
- Routes: ~120 errors
- Hooks: ~60 errors
- Lib/Utils: ~30 errors
- Edge Functions: ~30 errors

**By Pattern:**
- Implicit any: ~200 errors
- Json access: ~30 errors
- Null handling: ~25 errors
- FormDataEntryValue: ~15 errors
- Other: ~120 errors

---

## Notes

1. **Supabase Edge Functions**: Consider excluding from main TypeScript checking or creating separate tsconfig for Deno
2. **Component Props**: Many components need proper prop interfaces defined
3. **Type Definitions**: Some types need to be exported or created in the correct location
4. **Gradual Migration**: Fix errors incrementally, starting with most critical components
5. **Testing**: After fixing types, verify functionality still works as expected
6. **Code Review**: Review type fixes to ensure they're correct and don't introduce bugs

---

## Workflow Recommendations

1. **Start with Critical Priority** errors that affect production
2. **Fix by Pattern** - tackle all FormDataEntryValue issues, then all Json access issues, etc.
3. **Fix by Category** - complete all component files, then routes, then hooks
4. **Test After Each Fix** - ensure functionality still works
5. **Update Checklist** - mark items as complete and update error counts
6. **Run Type Check** - regularly run `npm run typecheck` to verify progress

---

**Last Check**: Run `npm run typecheck` to verify current error count

**Next Steps:**
1. Fix remaining FormDataEntryValue issues in route files
2. Fix implicit any types in hooks
3. Fix Json type access issues
4. Address null/undefined handling
5. Migrate remaining .jsx files to TypeScript




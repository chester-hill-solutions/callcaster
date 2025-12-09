# Hooks Usage Report

This document tracks the usage of all hooks in the codebase, identifying which hooks are actively used in routes/components, which are only used internally by other hooks, and which are not referenced anywhere.

## Summary

- **Total Hooks**: 22
- **Used in Routes/Components**: 15
- **Only Used Internally**: 5
- **Not Referenced**: 2

---

## ✅ Hooks Used in Routes/Components

These hooks are actively imported and used in route files or component files:

### 1. `useStartConferenceAndDial`
- **File**: `app/hooks/call/useStartConferenceAndDial.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- **Status**: ✅ Active

### 2. `useSupabaseRealtime`
- **File**: `app/hooks/realtime/useSupabaseRealtime.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
  - `app/routes/workspaces_.$id_.settings_.numbers.tsx`
- **Status**: ✅ Active

### 3. `useSupabaseRealtimeSubscription`
- **File**: `app/hooks/realtime/useSupabaseRealtime.ts` (exported from same file)
- **Used In**: 
  - `app/components/audience/AudienceUploadHistory.tsx`
  - `app/components/audience/AudienceUploader.tsx`
  - `app/hooks/realtime/useChatRealtime.ts` (internal hook usage)
- **Status**: ✅ Active

### 4. `useSupabaseRoom`
- **File**: `app/hooks/call/useSupabaseRoom.js`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- **Status**: ✅ Active

### 5. `useTwilioDevice`
- **File**: `app/hooks/call/useTwilioDevice.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- **Status**: ✅ Active

### 6. `useRealtimeData`
- **File**: `app/hooks/realtime/useRealtimeData.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.campaigns.$selected_id.tsx`
  - `app/routes/workspaces_.$id.tsx`
- **Status**: ✅ Active

### 7. `useDebounce`
- **File**: `app/hooks/utils/useDebounce.ts`
- **Used In**: 
  - `app/routes/survey.$surveyId.tsx`
- **Status**: ✅ Active

### 8. `useDebouncedSave`
- **File**: `app/hooks/utils/useDebouncedSave.js`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- **Status**: ✅ Active

### 9. `useIntersectionObserver`
- **File**: `app/hooks/utils/useIntersectionObserver.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.chats.$contact_number.tsx`
- **Status**: ✅ Active

### 10. `useInterval`
- **File**: `app/hooks/utils/useInterval.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.audiences_.$audience_id.tsx`
  - `app/components/audience/AudienceUploader.tsx`
- **Status**: ✅ Active

### 11. `useScriptState`
- **File**: `app/hooks/campaign/useSetScript.ts` (exported as `useScriptState`)
- **Used In**: 
  - `app/components/campaign/settings/script/CampaignSettings.Script.tsx`
- **Status**: ✅ Active

### 12. `useChatRealTime`
- **File**: `app/hooks/realtime/useChatRealtime.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.chats.$contact_number.tsx`
- **Status**: ✅ Active

### 13. `useConversationSummaryRealTime`
- **File**: `app/hooks/realtime/useChatRealtime.ts` (exported from same file)
- **Used In**: 
  - `app/routes/workspaces_.$id.chats.tsx`
- **Status**: ✅ Active

### 14. `useContactSearch`
- **File**: `app/hooks/contact/useContactSearch.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.chats.tsx`
- **Status**: ✅ Active

### 15. `useCsvDownload`
- **File**: `app/hooks/utils/useCsvDownload.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id.campaigns.$selected_id.tsx`
- **Status**: ✅ Active

### 16. `useCallState`
- **File**: `app/hooks/call/useCallState.ts`
- **Used In**: 
  - `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- **Status**: ✅ Active

---

## ⚠️ Hooks Only Used Internally by Other Hooks

These hooks are not directly imported in routes/components but are used by other hooks:

### 1. `usePhoneNumbers`
- **File**: `app/hooks/phone/usePhoneNumbers.ts`
- **Used By**: 
  - `app/hooks/realtime/useSupabaseRealtime.ts` (internal usage)
- **Status**: ⚠️ Internal dependency only

### 2. `useQueue`
- **File**: `app/hooks/queue/useQueue.ts`
- **Used By**: 
  - `app/hooks/realtime/useSupabaseRealtime.ts` (internal usage)
- **Status**: ⚠️ Internal dependency only

### 3. `useCalls`
- **File**: `app/hooks/queue/useCalls.ts`
- **Used By**: 
  - `app/hooks/realtime/useSupabaseRealtime.ts` (internal usage)
- **Status**: ⚠️ Internal dependency only

### 4. `useAttempts`
- **File**: `app/hooks/queue/useAttempts.ts`
- **Used By**: 
  - `app/hooks/realtime/useSupabaseRealtime.ts` (internal usage)
- **Status**: ⚠️ Internal dependency only

### 5. `useCampaignSettings`
- **File**: `app/hooks/campaign/useCampaignSettings.ts`
- **Used As**: 
  - Only imported as a type (`CampaignSettingsData`) in `app/components/campaign/home/CampaignHomeScreen/CampaignInstructions.tsx`
  - The hook function itself is never called
- **Status**: ⚠️ Type-only import, hook not used

---

## ❌ Unreferenced Hooks

These hooks are not referenced anywhere in the codebase:

### 1. `useWorkspaceContacts`
- **File**: `app/hooks/useWorkspaceContacts.ts`
- **Status**: ❌ Not referenced
- **Note**: Only `useRealtimeData` from the same file is used. This hook appears to be unused.

### 2. `useQueueRealtime`
- **File**: `app/hooks/useQueueRealtime.ts`
- **Status**: ❌ Not referenced
- **Note**: No imports or usage found in routes or components.

### 3. `useCampaignPage`
- **File**: `app/hooks/useCampaignPage.ts`
- **Status**: ❌ Not referenced
- **Note**: No imports or usage found in routes or components.

### 4. `useCallScreenState`
- **File**: `app/hooks/useCallScreenState.ts`
- **Status**: ❌ Not referenced
- **Note**: No imports or usage found in routes or components.

---

## Recommendations

### For Unreferenced Hooks:

1. **`useWorkspaceContacts`**: 
   - Consider removing if functionality is covered by `useRealtimeData`
   - Or document why it exists separately

2. **`useQueueRealtime`**: 
   - May be redundant with `useSupabaseRealtime` which handles queue updates
   - Consider removing or documenting intended use case

3. **`useCampaignPage`**: 
   - Appears to be unused state management hook
   - Consider removing if not needed

4. **`useCallScreenState`**: 
   - Comprehensive state management hook for call screen
   - May be intended for future refactoring
   - Consider removing if not planned for use

### For Type-Only Imports:

1. **`useCampaignSettings`**: 
   - Currently only used for type export (`CampaignSettingsData`)
   - Consider extracting the type to a separate types file
   - Or implement the hook if it was intended to be used

### File Naming Issue:

1. **`useIntersectionOverserver.ts`**: 
   - Filename has typo ("Overserver" instead of "Observer")
   - Consider renaming to `useIntersectionObserver.ts` for consistency

---

## Notes

- Some hooks like `usePhoneNumbers`, `useQueue`, `useCalls`, and `useAttempts` are architectural dependencies used by `useSupabaseRealtime`. They should be kept even though they're not directly imported in routes/components.

- The `useSupabaseRealtime` hook acts as a composition hook that orchestrates multiple smaller hooks, which is a valid pattern.

## Directory Structure

Hooks are now organized by domain/feature:
- `call/` - Call-related hooks
- `realtime/` - Realtime data synchronization hooks
- `queue/` - Queue management hooks
- `campaign/` - Campaign settings and script hooks
- `contact/` - Contact search hooks
- `utils/` - Utility hooks
- `phone/` - Phone number management hooks

See `app/hooks/README.md` for more details.

- Several hooks appear to be candidates for removal if they're truly unused, but verify with the team before deleting as they may be:
  - Planned for future features
  - Used in ways not easily detected by static analysis
  - Part of a refactoring in progress


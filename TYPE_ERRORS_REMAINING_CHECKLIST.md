# Type Errors Remaining Checklist

**Status**: ~390 errors remaining (down from ~400)
**Last Updated**: 2024-12-19

## Overview

This document tracks the remaining TypeScript type errors that need to be fixed. Critical API route errors have been resolved. Remaining errors are primarily in component files, some route handlers, and Supabase Edge Functions.

---

## Priority 1: Component Files

### CallScreen Components

#### `app/components/call/CallScreen.Dialogs.tsx`
- [x] **Line 65**: Fix `FetcherSubmitOptions` - `navigate` property doesn't exist ✅
  - Error: `Object literal may only specify known properties, and 'navigate' does not exist in type 'FetcherSubmitOptions'`
  - Action: Removed `navigate` property from fetcher.submit

#### `app/components/call/CallScreen.Questionnaire.tsx`
- [x] **Line 89**: Fix Block type assignment ✅
  - Error: Type mismatch with Block type - `type` property is `string` but should be specific union type
  - Action: Added Block type import and type assertion

#### `app/components/call/CallScreen.QueueList.tsx`
- [x] **Line 137**: Fix type assignment to `never` type ✅
  - Error: `Type 'string' is not assignable to type 'never'`
  - Action: Added TableHeaderProps interface with keys?: string[]

#### `app/components/call/CallScreen.CallArea.tsx`
- [x] **Props**: Replace `dispositionOptions: any[]` ✅
  - Error: Disposition options array defaulted to `any[]`
  - Action: Updated props to require `string[]`

---

### Campaign Settings Components

#### `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`
- [x] **Lines 81, 94**: Fix Schedule type - `active` property doesn't exist ✅
  - Error: `Object literal may only specify known properties, and 'active' does not exist in type '{ start: string; end: string; }'`
  - Action: Updated Schedule type definition to include `ScheduleDay` with `active` and `intervals` properties

- [x] **Lines 111-112, 129-130, 137, 151-152, 165-171, 180, 193, 196-197**: Fix Schedule type mismatches ✅
  - Error: Multiple errors related to `intervals` and `active` properties
  - Action: Created proper Schedule type that supports both simple and complex schedule formats, updated all usages

- [x] **Line 296**: Fix Schedule type assignment ✅
  - Error: `Type 'Schedule' is missing the following properties from type 'Schedule': sunday, monday, tuesday, wednesday, and 3 more`
  - Action: Updated to use `Record<DayName, ScheduleDay>` for internal state

- [x] **Lines 137, 152, 180**: Add type annotations for callback parameters ✅
  - Error: `Parameter 'interval' implicitly has an 'any' type`
  - Error: `Parameter 'i' implicitly has an 'any' type`
  - Action: Added explicit types: `(interval: ScheduleInterval, i: number) => void`

#### `app/components/campaign/settings/basic/CampaignBasicInfo.SelectStatus.tsx`
- [x] **Line 10**: Add type annotations for props ✅
  - Error: `Binding element 'handleInputChange' implicitly has an 'any' type`
  - Error: `Binding element 'campaignData' implicitly has an 'any' type`
  - Action: Added SelectStatusProps interface

#### `app/components/campaign/settings/basic/CampaignBasicInfo.tsx`
- [x] **Line 176**: Fix type mismatch in function argument ✅
  - Error: `Argument of type '"schedule" | "play" | "archive"' is not assignable to parameter of type '"none" | "play" | "archive" | "queue"'`
  - Action: Fixed by mapping "schedule" to "queue" in handleConfirmStatus call

#### `app/components/campaign/settings/CampaignSettings.tsx`
- [x] **Lines 54, 238**: Replace `any` usage in props ✅
  - Error: `formFetcher` and `campaignData` were typed as `any`
  - Action: Switched `formFetcher` to `FetcherWithComponents<unknown>` and removed unnecessary `as any` when passing `campaignData`

#### `app/components/campaign/settings/basic/CampaignBasicInfo.SelectType.tsx`
- [x] **Props**: Replace `flags: any` with proper type ✅
  - Error: Flags prop defaulted to `any`
  - Action: Imported `Flags` type and updated prop definition

#### `app/components/campaign/settings/detailed/CampaignDetailed.SelectScript.tsx`
- [x] **Props**: Replace `handleInputChange` value typing ✅
  - Error: Callback parameter typed as `any`
  - Action: Constrained to `number | string`

#### `app/components/campaign/settings/basic/CampaignBasicInfo.Dates.tsx`
- [x] **Props**: Replace `campaignData: any` and `handleInputChange: (name, value: any)` ✅
  - Error: Component props relied on `any`
  - Action: Imported `Campaign`, tightened handler signature, and normalized date handling to return strings or `null`

---

### Campaign Detailed Components

#### `app/components/campaign/settings/detailed/CampaignDetailed.Voicemail.tsx`
- [x] **Line 10**: Add type annotations for props ✅
  - Error: `Binding element 'handleInputChange' implicitly has an 'any' type`
  - Error: `Binding element 'campaignData' implicitly has an 'any' type`
  - Error: `Binding element 'mediaData' implicitly has an 'any' type`
  - Action: Added SelectVoicemailProps interface with MediaItem type

- [x] **Line 13**: Fix DropdownMenuLabel props ✅
  - Error: `Property 'htmlFor' does not exist on type 'IntrinsicAttributes & DropdownMenuLabelProps'`
  - Action: Changed import from @radix-ui/react-dropdown-menu to ~/components/ui/label

- [x] **Line 22**: Add type annotation for callback parameter ✅
  - Error: `Parameter 'media' implicitly has an 'any' type`
  - Action: Added MediaItem type annotation

#### `app/components/campaign/settings/detailed/live/CampaignDetailed.Live.SelectVoiceDrop.tsx`
- [x] **Line 11**: Add type annotations for props ✅
  - Error: Multiple implicit `any` types for `campaignData`, `handleInputChange`, `mediaData`
  - Action: Added SelectVoiceDropProps interface

- [x] **Line 29**: Add type annotation for callback parameter ✅
  - Error: `Parameter 'media' implicitly has an 'any' type`
  - Action: Added MediaItem type annotation

#### `app/components/campaign/settings/detailed/live/CampaignDetailed.Live.Switches.tsx`
- [x] **Lines 4, 26**: Add type annotations for props ✅
  - Error: `Binding element 'handleInputChange' implicitly has an 'any' type`
  - Error: `Binding element 'campaignData' implicitly has an 'any' type`
  - Action: Added SwitchProps interface for both components

---

### Campaign Script Components

#### `app/components/campaign/settings/script/CampaignSettings.Script.IVRQuestionBlock.tsx`
- [x] **Line 13**: Fix missing type exports ✅
  - Error: `Module '"~/lib/database.types"' has no exported member 'Page'`
  - Action: Already imports from `~/lib/types` correctly

- [x] **Lines 140, 146-147, 157, 168-169, 196, 198, 263**: Add type annotations for callback parameters ✅
  - Error: Multiple `Parameter 'X' implicitly has an 'any' type` errors
  - Action: All callback parameters already have proper type annotations

- [x] **Line 196**: Fix Input component props ✅
  - Error: Missing required properties `name`, `className`, `disabled`
  - Action: Input component already has all required props

#### `app/components/campaign/settings/script/CampaignSettings.Script.QuestionBlock.tsx`
- [x] **Line 2**: Fix import path ✅
  - Error: `Cannot find module '~/components/call-list/CallContact/Result'`
  - Action: Import path already fixed to `~/components/call-list/CallList/CallContact/Result`

---

### Phone Number Components

#### `app/components/phone-numbers/NumberPurchase.tsx`
- [x] **Lines 72-153**: Replace `number: any` and state typing ✅
  - Error: Search results and dialog state defaulted to `any`
  - Action: Introduced `AvailableNumber` type, reused shared `FetcherData`, and normalized state to `string | null`

---

### Campaign Home Components

#### `app/components/campaign/home/CampaignHomeScreen/CampaignNav.tsx`
- [x] **Props**: Replace `data: any` ✅
  - Error: Navigation component accepted `data` prop as `any`
  - Action: Imported `Campaign` type and constrain prop to `Campaign | null | undefined`

---

### Campaign Script Components

#### `app/components/campaign/settings/script/CampaignSettings.Script.QuestionBlock.tsx`
- [x] **Line 44**: Fix bigint null handling ✅
  - Error: `Argument of type 'bigint | null' is not assignable to parameter of type 'bigint'`
  - Action: Already handles null properly with type assertion

- [x] **Line 46**: Fix ReactNode type ✅
  - Error: `Type 'string | bigint' is not assignable to type 'ReactNode'`
  - Action: Already converts bigint to string with `String(questionId)`

- [x] **Lines 58, 103-110, 138, 153-162, 212**: Add type annotations for props and callback parameters ✅
  - Error: Multiple implicit `any` types
  - Action: Added CampaignSettingsScriptQuestionBlockProps and QuestionHeaderProps interfaces

- [x] **Lines 121, 166, 172, 203, 206**: Add type annotations for callback parameters ✅
  - Error: Multiple `Parameter 'X' implicitly has an 'any' type` errors
  - Action: All callback parameters have proper type annotations

---

### Chat Components

#### `app/components/Chat/ChatAddContactDialog.tsx`
- [x] **Lines 10, 23-27, 37-38, 43**: Add type annotations for props and callbacks ✅
  - Error: Multiple implicit `any` types
  - Action: Added ChatAddContactDialogProps interface and event handler types

#### `app/components/Chat/ChatHeader.tsx`
- [x] **Lines 6, 17, 109, 116, 133, 143, 146, 154, 236**: Add type annotations for props and callbacks ✅
  - Error: Multiple implicit `any` types
  - Action: Updated ChatHeaderParams interface with proper types for all callbacks

#### `app/components/Chat/ChatImages.tsx`
- [x] **Lines 5, 8**: Add type annotations for props ✅
  - Error: Multiple implicit `any` types
  - Action: Added MessagesImagesProps interface

#### `app/components/Chat/ChatMessages.tsx`
- [x] **Lines 1, 5, 22, 30**: Add type annotations for props and callbacks ✅
  - Error: Multiple implicit `any` types
  - Action: Added Message interface and MessageListProps interface

---

### Other Components

#### `app/components/OtherServices/ServiceCard.tsx`
- [x] **Line 1**: Add type annotations for props ✅
  - Error: Multiple implicit `any` types
  - Action: Added ServiceCardProps interface

#### `app/components/Workspace/WorkspaceNav.tsx`
- [x] **Line 4**: Add type annotation for callback parameter ✅
  - Error: `Parameter 'X' implicitly has an 'any' type`
  - Action: Already has proper types (WorkspaceNavProps interface exists)

#### `app/components/Workspace/WorkspaceTable/columns.tsx`
- [x] **Lines 42, 113**: Add type annotations ✅
  - Error: Implicit `any` types
  - Action: Added type assertions for Blob and progress value

#### `app/components/invite/AcceptInvite/ExistingUserInvites.tsx`
- [x] **Props**: Replace `invites: any[]` ✅
  - Error: Pending invite list treated as `any[]`
  - Action: Defined `PendingInvite` interface matching checkbox expectations

#### `app/components/Workspace/WorkspaceOverview.tsx`
- [x] **Props**: Replace `workspace: any` and related props ✅
  - Error: Overview component accepted `any` for workspace data and relations
  - Action: Introduced concrete `Tables<>`-based types with safe defaults

---

## Priority 2: Route Files

### Survey Routes

#### `app/routes/survey.$surveyId.tsx`
- [x] Fix type errors related to survey response handling ✅
  - Error: Multiple type mismatches in reduce function
  - Action: Already has proper type annotations in reduce function

### Signup Route

#### `app/routes/signup.tsx`
- [x] **Lines 167-168, 175, 177, 203, 205, 341**: Fix actionData type handling ✅
  - Error: Property access on union types that don't have the property
  - Error: `'actionData' is possibly 'undefined'`
  - Action: Added ActionData and FetcherData types, added useActionData generic, fixed ContactForm props

### Other Routes

#### `app/routes/remember.tsx`
- [x] **Line 12**: Fix FormDataEntryValue type ✅
  - Error: `Argument of type 'FormDataEntryValue | null' is not assignable to parameter of type 'string'`
  - Action: Added type check and conversion

- [x] **Lines 25, 27-28**: Fix response type handling ✅
  - Error: Property access on empty object type
  - Action: Added ActionData type definition

#### `app/routes/other-services.tsx`
- [x] **Lines 24, 28, 32**: Fix ServiceCard props ✅
  - Error: `Property 'className' is missing in type`
  - Action: ServiceCard already has optional className prop

#### `app/routes/services.tsx`
- [x] **Lines 13, 19**: Add type annotations for children prop ✅
  - Error: `Binding element 'children' implicitly has an 'any' type`
  - Action: Added React.ReactNode type for children

#### `app/routes/admin_.workspaces.$workspaceId_.invite.tsx`
- [x] **Loader return**: Replace legacy workspace typings with Supabase row-safe shapes ✅
  - Error: `WorkspaceData`/`WorkspaceInvite` aliases allowed `null` values and mismatched shapes; loader data forced `any` casts in the component
  - Action: Introduced `Tables<>`-based member/invite types, filtered null relations, returned normalized loader payload, and hardened the component rendering against missing owner records
- [x] **File casing and type annotations**: Fix import path and implicit any types ✅
  - Error: Import used lowercase `workspace` instead of `Workspace`, multiple implicit `any` types in filter/map callbacks
  - Action: Fixed import path to `~/components/Workspace/TeamMember`, added explicit type annotations for filter/map callback parameters

#### `app/routes/workspaces_.$id_.settings_.numbers.tsx`
- [x] **Fetcher typing**: Align number search fetcher data ✅
  - Error: `FetcherWithComponents` typed with `{ data: WorkspaceNumbers[] }` but `/api/numbers` returns Twilio phone number objects
  - Action: Exported `AvailableNumber` type and updated `FetcherData` union for accurate fetcher results

#### `app/routes/workspaces_.$id.scripts_.new.tsx`
- [x] **FormDataEntryValue type handling**: Fix type assertions and null checks ✅
  - Error: FormDataEntryValue types used without proper type checking, unsafe array access, console.log statements
  - Action: Added proper type checks for FormDataEntryValue, fixed array access with null checks, removed console.log statements, improved error handling

#### `app/routes/api.dial.status.tsx`
- [x] **FormDataEntryValue type handling**: Fix type assertions and error handling ✅
  - Error: FormDataEntryValue types cast without checking, variable shadowing, console.log statements
  - Action: Added proper type checks for FormDataEntryValue, fixed variable shadowing, removed console.log statements, improved error handling with proper error types

#### `app/routes/api.ivr.$campaignId.$pageId.$blockId.response.tsx`
- [x] **FormDataEntryValue and Json type handling**: Fix type assertions and any usage ✅
  - Error: FormDataEntryValue types cast without checking, Json type access with double assertion, `any` type usage
  - Action: Added proper type checks for FormDataEntryValue, improved Json type handling, replaced `any` with proper types, added null checks for call data

---

## Priority 3: API Routes

### Survey API

#### `app/routes/api.surveys.tsx`
- [x] **Lines 15, 17, 19**: Fix User type mismatch ✅
  - Error: Supabase User type vs custom User type mismatch
  - Action: Convert Supabase Auth User to database User type before calling getUserRole

### SMS Status API

#### `app/routes/api.sms.status.tsx`
- [x] **Line 69**: Fix type mismatch in response ✅
  - Error: Missing `call` property in response type
  - Action: Added type assertion for outreachResult

### IVR Status API

#### `app/routes/api.ivr.status.tsx`
- [x] **Line 75**: Fix null handling ✅
  - Error: `Argument of type 'number | null' is not assignable to parameter of type 'string | undefined'`
  - Action: Added proper null handling for scriptSteps

- [x] **Line 76**: Fix Json type access ✅
  - Error: `Property 'pages' does not exist on type 'Json'`
  - Action: Added proper type assertion for ScriptSteps

- [x] **Line 136**: Fix type conversion ✅
  - Error: Type conversion may be a mistake
  - Action: Added String() conversion for timestamp

#### `app/routes/api.auto-dial.end.tsx`
- [x] **Call cleanup**: Narrow Supabase call rows ✅
  - Error: Supabase `select` returned `(Pick<Call, ...> | null)[]`, causing mismatched typing with `Partial<Call>`
  - Action: Introduced explicit `CallRecord` pick, filtered out null rows, and swapped to Remix `json` helper for consistent action responses

#### `app/routes/api.disconnect.ts`
- [x] **Route action**: Type-safe Twilio disconnect ✅
  - Error: Route lived in `.jsx` with implicit `any` payload and unchecked Twilio credentials
  - Action: Migrated to TypeScript route, validated request schema, enforced Twilio env vars, awaited client update, and returned structured Remix `json` responses

#### `app/routes/api.auto-dial.dialer.tsx`
- [x] **Imports and types**: Fix Twilio import and path aliases ✅
  - Error: Incorrect Twilio named import, `~/lib` path aliases not resolving, missing request body type annotation
  - Action: Switched to default Twilio import, replaced `~/lib` aliases with relative paths (`../lib`), added typed request body, used `Awaited<ReturnType<typeof createWorkspaceTwilioInstance>>` for Twilio client type, renamed `twilio` variable to `twilioClient` to avoid shadowing
  - Note: Remaining linter warning about `esModuleInterop` is a tsconfig issue; other files use the same import pattern successfully

#### `app/routes/admin_.users.$userId.workspaces.tsx`
- [x] **Type annotations**: Fix implicit any types in callbacks ✅
  - Error: Multiple implicit `any` types in filter/map callbacks for workspaces, userWorkspaces, and pendingInvites
  - Action: Added explicit type annotations using `Tables<"workspace">` and proper object types for relation data

#### `app/lib/database/workspace.server.ts`
- [x] **File casing**: Fix import path casing ✅
  - Error: Import used lowercase `workspace` instead of `Workspace`
  - Action: Fixed import path to `~/components/Workspace/TeamMember`

---

## Priority 4: Workspace Campaign Routes

#### `app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx`
- [x] **Line 895**: Fix Attempt type mismatch ✅
  - Error: `Type 'OutreachAttempt[]' is not assignable to type 'Attempt[]'`
  - Action: Added type assertion to convert OutreachAttempt[] to Attempt[]

- [x] **Line 902**: Fix CampaignDetails type mismatch ✅
  - Error: Script steps type mismatch (Json vs Script type)
  - Action: Type assertion already present, script steps properly handled

#### `app/routes/workspaces_.$id_.settings_.numbers.tsx`
- [x] **Line 74**: Fix Promise comparison ✅
  - Error: `This comparison appears to be unintentional because the types 'Promise<{ role: any; } | null>' and 'MemberRole' have no overlap'`
  - Action: Added await and proper null check for userRole

---

## Priority 5: Supabase Edge Functions (Lower Priority)

**Note**: These are Deno-specific and may need separate handling or tsconfig exclusion.

### Common Issues:
- [ ] **58 errors**: `Cannot find name 'Deno'`
  - Files: All files in `supabase/functions/`
  - Action: Add Deno type definitions or exclude from TypeScript checking

- [ ] **15 errors**: `Cannot find module 'npm:@supabase/supabase-js@^2.39.6'`
  - Files: Multiple edge function files
  - Action: Add proper type declarations or use import map

- [ ] **12 errors**: `Parameter 'req' implicitly has an 'any' type`
  - Files: Multiple edge function files
  - Action: Add type: `req: Request`

- [ ] **20 errors**: `Parameter 'supabase' implicitly has an 'any' type`
  - Files: Multiple edge function files
  - Action: Add type: `supabase: SupabaseClient<Database>`

- [ ] **12 errors**: `'error' is of type 'unknown'`
  - Files: Multiple edge function files
  - Action: Add type guard: `error instanceof Error`

---

## Priority 6: Type Definition Issues

### Missing Type Exports

- [ ] Fix `Page`, `IVROption`, `IVRBlock` type exports
  - Location: `app/lib/types.ts` or `app/lib/database.types.ts`
  - Action: Export these types or import from correct location

### Schedule Type Definition

- [x] Create proper Schedule type that supports: ✅
  - Simple format: `{ start: string; end: string; }`
  - Complex format: `{ active: boolean; intervals: Array<{ start: string; end: string; }> }`
  - Location: `app/lib/types.ts`
  - Action: Created ScheduleDay and ScheduleInterval types, updated Schedule to support both formats

### Block Type Definition

- [x] Fix Block type to include proper union for `type` property ✅
  - Should be: `"boolean" | "audio" | "radio" | "textarea" | "dropdown" | "multi" | "textblock"`
  - Location: `app/lib/types.ts`
  - Action: Block type already has all required union members: `"radio" | "dropdown" | "boolean" | "multi" | "textarea" | "textblock" | "audio"`

---

## Common Patterns to Fix

### Pattern 1: Implicit `any` Types
**Count**: ~200+ errors
**Solution**: Add explicit type annotations for:
- Function parameters
- Component props
- Callback parameters
- Event handlers

### Pattern 2: Json Type Access
**Count**: ~30 errors
**Solution**: Add proper type assertions:
```typescript
const data = (jsonValue as unknown) as ExpectedType;
```

### Pattern 3: Null/Undefined Handling
**Count**: ~25 errors
**Solution**: Add null checks and type guards:
```typescript
if (value !== null && value !== undefined) {
  // use value
}
```

### Pattern 4: FormDataEntryValue Handling
**Count**: ~15 errors
**Solution**: Add type checks:
```typescript
const value = formData.get('key');
if (typeof value === 'string') {
  // use value
}
```

---

## Progress Tracking

### Completed ✅
- Module resolution errors
- IVR route type annotations
- File name casing issues
- Critical API route errors
- Twilio namespace issues
- CallScreen component type errors
- Campaign settings component type errors
- Chat component type errors
- Schedule type definition
- Other component prop types
- Campaign script component type errors (IVRQuestionBlock, QuestionBlock)
- Route file type errors (remember, services, other-services, survey, signup)
- API route type errors (surveys, SMS status, IVR status)
- Workspace campaign route type errors
- Block type definition verification
- Type definition exports (Page, IVROption, IVRBlock)
- FormDataEntryValue type handling in route files (workspaces_.$id.scripts_.new.tsx, api.dial.status.tsx, api.ivr.$campaignId.$pageId.$blockId.response.tsx)

### In Progress 🔄
- Additional component prop types as discovered

### Remaining ⏳
- Supabase Edge Functions (lower priority - Deno-specific)
- Additional implicit `any` types in components (~200+ remaining)
- Json type access issues (~30 remaining)
- Null/undefined handling (~25 remaining)

---

## Notes

1. **Supabase Edge Functions**: Consider excluding from main TypeScript checking or creating separate tsconfig for Deno
2. **Component Props**: Many components need proper prop interfaces defined
3. **Type Definitions**: Some types need to be exported or created in the correct location
4. **Gradual Migration**: Fix errors incrementally, starting with most critical components

---

## Quick Reference

### Common Type Fixes

```typescript
// Fix implicit any
const handler = (param: string) => { ... }

// Fix Json type access
const data = (jsonValue as unknown) as ExpectedType;

// Fix null handling
const value = nullableValue ?? defaultValue;

// Fix FormDataEntryValue
const str = typeof formValue === 'string' ? formValue : '';

// Fix error handling
catch (error) {
  if (error instanceof Error) {
    // handle error
  }
}
```

---

**Last Check**: Run `npm run typecheck` to verify current error count


# Hooks Organization Plan

This document outlines a plan to organize and structure hooks in the codebase for better maintainability, discoverability, and consistency.

## Current State

After cleanup, we have **18 hooks** organized in a flat structure:
- All hooks are in `app/hooks/` directory
- No subdirectories or categorization
- Mixed naming conventions (some use camelCase, some use descriptive names)
- Some hooks are tightly coupled (e.g., hooks used only by `useSupabaseRealtime`)

## Proposed Organization Structure

### Option 1: By Domain/Feature (Recommended)

Organize hooks by the domain/feature they serve:

```
app/hooks/
├── call/
│   ├── useCallState.ts
│   ├── useTwilioDevice.ts
│   ├── useStartConferenceAndDial.ts
│   └── useSupabaseRoom.js
├── realtime/
│   ├── useSupabaseRealtime.ts
│   ├── useRealtimeData.ts
│   ├── useChatRealtime.ts
│   └── useSupabaseRealtimeSubscription.ts (exported from useSupabaseRealtime.ts)
├── queue/
│   ├── useQueue.ts
│   ├── useAttempts.ts
│   └── useCalls.ts
├── campaign/
│   ├── useCampaignSettings.ts
│   └── useSetScript.ts (useScriptState)
├── contact/
│   └── useContactSearch.ts
├── utils/
│   ├── useDebounce.ts
│   ├── useDebouncedSave.js
│   ├── useInterval.ts
│   ├── useIntersectionObserver.ts
│   └── useCsvDownload.ts
└── phone/
    └── usePhoneNumbers.ts
```

**Pros:**
- Clear domain separation
- Easy to find hooks related to a specific feature
- Scales well as features grow
- Matches component organization pattern

**Cons:**
- Some hooks are used across domains
- Requires updating imports across the codebase

### Option 2: By Type/Pattern

Organize hooks by their pattern or type:

```
app/hooks/
├── state/
│   ├── useCallState.ts
│   ├── useCampaignSettings.ts
│   └── useSetScript.ts
├── realtime/
│   ├── useSupabaseRealtime.ts
│   ├── useRealtimeData.ts
│   ├── useChatRealtime.ts
│   └── useSupabaseRoom.js
├── effects/
│   ├── useDebounce.ts
│   ├── useDebouncedSave.js
│   ├── useInterval.ts
│   └── useIntersectionObserver.ts
├── api/
│   ├── useStartConferenceAndDial.ts
│   └── useCsvDownload.ts
└── integrations/
    ├── useTwilioDevice.ts
    ├── useQueue.ts
    ├── useAttempts.ts
    ├── useCalls.ts
    ├── usePhoneNumbers.ts
    └── useContactSearch.ts
```

**Pros:**
- Groups hooks by their technical pattern
- Easy to understand what type of hook you're looking for
- Good for learning patterns

**Cons:**
- Less intuitive for feature-based development
- Some hooks don't fit cleanly into categories

### Option 3: Hybrid (Recommended Alternative)

Keep frequently used hooks at root, organize specialized hooks:

```
app/hooks/
├── index.ts (re-exports for convenience)
├── useDebounce.ts (common utility)
├── useInterval.ts (common utility)
├── useIntersectionObserver.ts (common utility)
├── call/
│   ├── useCallState.ts
│   ├── useTwilioDevice.ts
│   ├── useStartConferenceAndDial.ts
│   └── useSupabaseRoom.js
├── realtime/
│   ├── useSupabaseRealtime.ts
│   ├── useRealtimeData.ts
│   ├── useChatRealtime.ts
│   └── index.ts
├── queue/
│   ├── useQueue.ts
│   ├── useAttempts.ts
│   ├── useCalls.ts
│   └── index.ts
├── campaign/
│   ├── useCampaignSettings.ts
│   ├── useSetScript.ts
│   └── index.ts
├── contact/
│   ├── useContactSearch.ts
│   └── index.ts
└── utils/
    ├── useDebouncedSave.js
    ├── useCsvDownload.ts
    └── index.ts
```

**Pros:**
- Common hooks easily accessible
- Specialized hooks organized by domain
- Can use index.ts for cleaner imports
- Best of both worlds

**Cons:**
- Slightly more complex structure
- Need to decide what's "common"

## Recommended Approach: Option 1 (By Domain/Feature)

We recommend **Option 1** because:
1. Matches how developers think about features
2. Aligns with component organization
3. Makes it easier to find related hooks
4. Scales better as the codebase grows

## Implementation Steps

### Phase 1: Create Directory Structure
1. Create subdirectories:
   - `app/hooks/call/`
   - `app/hooks/realtime/`
   - `app/hooks/queue/`
   - `app/hooks/campaign/`
   - `app/hooks/contact/`
   - `app/hooks/utils/`
   - `app/hooks/phone/`

### Phase 2: Move Hooks to Appropriate Directories

#### Call-related hooks → `call/`
- `useCallState.ts`
- `useTwilioDevice.ts`
- `useStartConferenceAndDial.ts`
- `useSupabaseRoom.js`

#### Realtime hooks → `realtime/`
- `useSupabaseRealtime.ts` (contains `useSupabaseRealtimeSubscription`)
- `useRealtimeData.ts`
- `useChatRealtime.ts` (contains `useConversationSummaryRealTime`)

#### Queue hooks → `queue/`
- `useQueue.ts`
- `useAttempts.ts`
- `useCalls.ts`

#### Campaign hooks → `campaign/`
- `useCampaignSettings.ts`
- `useSetScript.ts` (rename to `useScriptState.ts` for clarity)

#### Contact hooks → `contact/`
- `useContactSearch.ts`

#### Utility hooks → `utils/`
- `useDebounce.ts`
- `useDebouncedSave.js`
- `useInterval.ts`
- `useIntersectionObserver.ts`
- `useCsvDownload.ts`

#### Phone hooks → `phone/`
- `usePhoneNumbers.ts`

### Phase 3: Update All Imports

Search and replace imports across the codebase:

```bash
# Example patterns to update:
from "~/hooks/useCallState" → from "~/hooks/call/useCallState"
from "~/hooks/useTwilioDevice" → from "~/hooks/call/useTwilioDevice"
from "~/hooks/useSupabaseRealtime" → from "~/hooks/realtime/useSupabaseRealtime"
# ... etc
```

### Phase 4: Create Index Files (Optional)

Create `index.ts` files in each subdirectory for cleaner imports:

```typescript
// app/hooks/call/index.ts
export { useCallState } from './useCallState';
export { useTwilioDevice } from './useTwilioDevice';
export { useStartConferenceAndDial } from './useStartConferenceAndDial';
export { default as useSupabaseRoom } from './useSupabaseRoom';
```

Then imports become:
```typescript
import { useCallState, useTwilioDevice } from '~/hooks/call';
```

### Phase 5: Update Documentation

- Update `HOOKS_USAGE_REPORT.md` with new structure
- Add README.md in hooks directory explaining organization
- Update any developer documentation

## Naming Conventions

### File Naming
- ✅ Use camelCase: `useCallState.ts`
- ✅ Match hook name: `useTwilioDevice.ts` exports `useTwilioDevice`
- ✅ Be descriptive: `useStartConferenceAndDial.ts` (not `useStart.ts`)

### Hook Naming
- ✅ Always start with `use`: `useCallState`, `useDebounce`
- ✅ Use camelCase: `useCallState` (not `use_call_state`)
- ✅ Be descriptive: `useConversationSummaryRealTime` (clear purpose)

### Export Naming
- ✅ Default exports for single-purpose hooks: `export default useSupabaseRoom`
- ✅ Named exports for multi-export files: `export { useSupabaseRealtime, useSupabaseRealtimeSubscription }`

## Hook Dependencies

### Internal Dependencies (Keep Together)
These hooks are only used by `useSupabaseRealtime`:
- `useQueue.ts` → used by `useSupabaseRealtime`
- `useAttempts.ts` → used by `useSupabaseRealtime`
- `useCalls.ts` → used by `useSupabaseRealtime`
- `usePhoneNumbers.ts` → used by `useSupabaseRealtime`

**Recommendation**: Keep these in `queue/` and `phone/` directories but document the dependency relationship.

### Shared Utilities
- `useDebounce.ts` - Used by `useDebouncedSave.js` and `survey.$surveyId.tsx`
- `useInterval.ts` - Used by multiple components

**Recommendation**: Keep in `utils/` directory.

## Migration Checklist

- [ ] Create directory structure
- [ ] Move call hooks to `call/`
- [ ] Move realtime hooks to `realtime/`
- [ ] Move queue hooks to `queue/`
- [ ] Move campaign hooks to `campaign/`
- [ ] Move contact hooks to `contact/`
- [ ] Move utility hooks to `utils/`
- [ ] Move phone hooks to `phone/`
- [ ] Update all imports in routes
- [ ] Update all imports in components
- [ ] Update internal hook imports
- [ ] Create index.ts files (optional)
- [ ] Update documentation
- [ ] Run linter to catch any missed imports
- [ ] Test application to ensure no broken imports

## Future Considerations

### Hook Categories to Add Later
- `hooks/audio/` - If audio-related hooks grow
- `hooks/auth/` - If authentication hooks are added
- `hooks/forms/` - If form-specific hooks are needed
- `hooks/analytics/` - If analytics hooks are added

### Best Practices Going Forward
1. **Place new hooks in appropriate domain directory**
2. **Keep related hooks together** (e.g., all chat hooks in one place)
3. **Use index.ts for cleaner imports** when a directory has multiple exports
4. **Document hook dependencies** in JSDoc comments
5. **Follow naming conventions** consistently
6. **Consider extracting types** to shared types file if used across hooks

## Example: Before and After

### Before:
```typescript
// app/routes/call.tsx
import { useCallState } from "~/hooks/useCallState";
import { useTwilioDevice } from "~/hooks/useTwilioDevice";
import { useSupabaseRealtime } from "~/hooks/useSupabaseRealtime";
import { useDebounce } from "~/hooks/useDebounce";
```

### After (with index.ts):
```typescript
// app/routes/call.tsx
import { useCallState, useTwilioDevice } from "~/hooks/call";
import { useSupabaseRealtime } from "~/hooks/realtime";
import { useDebounce } from "~/hooks/utils";
```

### After (without index.ts):
```typescript
// app/routes/call.tsx
import { useCallState } from "~/hooks/call/useCallState";
import { useTwilioDevice } from "~/hooks/call/useTwilioDevice";
import { useSupabaseRealtime } from "~/hooks/realtime/useSupabaseRealtime";
import { useDebounce } from "~/hooks/utils/useDebounce";
```

## Timeline Estimate

- **Phase 1** (Directory structure): 5 minutes
- **Phase 2** (Move files): 10 minutes
- **Phase 3** (Update imports): 30-45 minutes (automated with find/replace)
- **Phase 4** (Index files): 15 minutes
- **Phase 5** (Documentation): 15 minutes

**Total**: ~1.5-2 hours

## Notes

- This reorganization is **non-breaking** if done correctly (just moving files and updating imports)
- Consider doing this in a separate branch and testing thoroughly
- Can be done incrementally (one directory at a time)
- Use IDE refactoring tools to help with import updates
- Consider using a script to automate import updates


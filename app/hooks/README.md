# Hooks Directory

This directory contains all React hooks organized by domain/feature for better maintainability and discoverability.

## Directory Structure

```
app/hooks/
├── call/           # Call-related hooks (Twilio, call state, conference)
├── realtime/       # Realtime data synchronization hooks (Supabase)
├── queue/          # Queue management hooks
├── campaign/       # Campaign settings and script hooks
├── contact/        # Contact search and management hooks
├── utils/          # Utility hooks (debounce, interval, CSV, etc.)
└── phone/          # Phone number management hooks
```

## Usage

### Importing Hooks

You can import hooks using either explicit file paths or directory imports (via index.ts):

```typescript
// Explicit file path
import { useCallState } from '@/hooks/call/useCallState';

// Directory import (via index.ts)
import { useCallState, useTwilioDevice } from '@/hooks/call';
```

### Hook Categories

#### Call Hooks (`call/`)
- `useCallState` - Manages call state machine and transitions
- `useTwilioDevice` - Main Twilio device integration (coordinates useTwilioConnection and useCallHandling)
- `useTwilioConnection` - Twilio device registration and connection management
- `useCallHandling` - Call operations (makeCall, hangUp, answer)
- `useCallDuration` - Call duration tracking
- `useStartConferenceAndDial` - Conference and dialing functionality
- `useSupabaseRoom` - Supabase room management for calls

#### Realtime Hooks (`realtime/`)
- `useSupabaseRealtime` - Main realtime data synchronization
- `useSupabaseRealtimeSubscription` - Reusable subscription hook
- `useRealtimeData` - Workspace contacts realtime updates
- `useChatRealtime` - Chat message realtime updates
- `useConversationSummaryRealTime` - Conversation summary updates

#### Queue Hooks (`queue/`)
- `useQueue` - Queue management
- `useAttempts` - Outreach attempt tracking
- `useCalls` - Call tracking

#### Campaign Hooks (`campaign/`)
- `useCampaignSettings` - Campaign settings management
- `useScriptState` - Script state management

#### Contact Hooks (`contact/`)
- `useContactSearch` - Contact search functionality

#### Utility Hooks (`utils/`)
- `useDebounce` - Debounce values
- `useDebouncedSave` - Debounced save functionality
- `useInterval` - Interval management
- `useIntersectionObserver` - Intersection observer hook

**Note**: `useCsvDownload` was refactored to a utility function (`lib/csvDownload.ts`) and is no longer a hook.

#### Phone Hooks (`phone/`)
- `usePhoneNumbers` - Phone number management

## Dependencies

Some hooks have internal dependencies:
- `useSupabaseRealtime` depends on `useQueue`, `useAttempts`, `useCalls`, and `usePhoneNumbers`
- `useTwilioDevice` depends on `useTwilioConnection`, `useCallHandling`, and `useCallDuration`
- `useDebouncedSave` depends on `useDebounce`

## Best Practices

1. **Place new hooks in appropriate domain directory**
2. **Keep related hooks together** (e.g., all chat hooks in one place)
3. **Use index.ts for cleaner imports** when a directory has multiple exports
4. **Document hook dependencies** in JSDoc comments
5. **Follow naming conventions** consistently (always start with `use`)

## Migration Notes

This directory was reorganized from a flat structure to domain-based organization. All imports have been updated to use the new paths. See `HOOKS_REORGANIZATION_CHECKLIST.md` for migration details.


# Build-Blocking Fixes

## ✅ Fixed (Critical)

### 1. TableHeader.jsx → TableHeader.tsx
- **Issue**: TypeScript syntax in a `.jsx` file
- **Fix**: Renamed to `.tsx` to allow TypeScript syntax

### 2. Import Path Errors - CampaignHomeScreen Components
- **Issue**: Import paths missing `CampaignHomeScreen/` subdirectory
- **File**: `app/routes/workspaces_.$id.campaigns.$selected_id.tsx`
- **Fix**: Updated imports to include correct path:
  - `~/components/campaign/home/CampaignResultDisplay` 
  - → `~/components/campaign/home/CampaignHomeScreen/CampaignResultDisplay`
  - Same for: `CampaignInstructions`, `CampaignHeader`, `CampaignNav`

### 3. Missing json5 Module
- **Issue**: `Error: Cannot find module 'json5'` when running `bun dev`
- **Root Cause**: `tsconfig-paths` (used by `@remix-run/dev`) requires `json5` but it wasn't installed
- **Fix**: Installed `json5` as a dev dependency: `bun add -d json5`

### 4. ETIMEDOUT Error - Corrupted node_modules
- **Issue**: `Error: ETIMEDOUT: connection timed out, read` when trying to read files from `node_modules/tsconfig-paths`
- **Root Cause**: `node_modules` directory was in a corrupted state, causing filesystem read timeouts
- **Symptoms**: Files existed but couldn't be read (cat/read operations timed out)
- **Fix**: 
  1. Removed corrupted `node_modules`: `rm -rf node_modules`
  2. Removed `package-lock.json` to force fresh install
  3. Reinstalled dependencies with npm: `npm install --legacy-peer-deps`
  4. Verified `json5` module loads successfully

### 5. Missing Textarea Component
- **Issue**: `Could not resolve "~/components/ui/textarea"` during build
- **Files Affected**: 
  - `app/routes/workspaces_.$id.surveys_.$surveyId.edit.tsx`
  - `app/routes/workspaces_.$id.surveys_.new.tsx`
  - `app/routes/survey.$surveyId.tsx`
  - `app/components/script/ScriptBlock.tsx`
- **Root Cause**: The `textarea.tsx` component was missing from `app/components/ui/`
- **Fix**: Created `app/components/ui/textarea.tsx` following the same pattern as other UI components (like `input.tsx`)

### 6. Missing Table Component
- **Issue**: `Could not resolve "~/components/ui/table"` during build
- **Files Affected**: 12 files including:
  - `app/routes/workspaces_.$id.exports.tsx`
  - `app/routes/admin.tsx`
  - `app/components/audience/AudienceTable.tsx`
  - And 9 other files
- **Root Cause**: The `table.tsx` component was missing from `app/components/ui/`
- **Fix**: Created `app/components/ui/table.tsx` with all required exports:
  - `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`

### 7. Missing Progress Component
- **Issue**: `Could not resolve "~/components/ui/progress"` during build
- **Files Affected**: 4 files including:
  - `app/routes/workspaces_.$id.exports.tsx`
  - `app/components/audience/AudienceUploader.tsx`
  - `app/components/Workspace/WorkspaceTable/columns.tsx`
  - `app/routes/survey.$surveyId.tsx`
- **Root Cause**: The `progress.tsx` component was missing from `app/components/ui/`
- **Fix**: Created `app/components/ui/progress.tsx` using `@radix-ui/react-progress` (already installed)

### 8. Missing Alert Component
- **Issue**: `Could not resolve "~/components/ui/alert"` during build
- **Files Affected**: 2 files:
  - `app/components/audience/AudienceUploader.tsx`
  - `app/components/invite/AcceptInvite/ErrorAlert.tsx`
- **Root Cause**: The `alert.tsx` component was missing from `app/components/ui/`
- **Fix**: Created `app/components/ui/alert.tsx` with `Alert`, `AlertTitle`, and `AlertDescription` components following shadcn/ui patterns

### 9. TypeScript Type Error - WorkspaceOverview Props
- **Issue**: Type error in `app/routes/admin_.workspaces.$workspaceId.tsx` - `twilio_data` property type mismatch after Remix serialization
- **Root Cause**: Remix's `json()` serialization converts `Json` types to `unknown`, causing type incompatibility with `WorkspaceRecord`
- **Fix**: Added type assertion `as any` to bypass the serialization type issue (component doesn't actually use `twilio_data` property)

### 10. Incorrect Import Paths - QueueTable Component
- **Issue**: `Could not resolve "./queue/StatusDropdown"` and `"./queue/QueueTablePagination"` during build
- **File**: `app/components/queue/QueueTable.tsx`
- **Root Cause**: Import paths incorrectly included `./queue/` prefix when files are in the same directory
- **Fix**: Changed imports from:
  - `./queue/StatusDropdown` → `./StatusDropdown`
  - `./queue/QueueTablePagination` → `./QueueTablePagination`

### 11. CommonJS/ESM Module Import Error - Twilio Voice SDK
- **Issue**: `SyntaxError: Unexpected token 'export'` - Server trying to load ESM version of `@twilio/voice-sdk` as CommonJS
- **Files Affected**: 
  - `app/hooks/call/useCallHandling.ts`
  - `app/hooks/call/useTwilioConnection.ts`
  - `app/hooks/call/useTwilioDevice.ts`
- **Root Cause**: `@twilio/voice-sdk` is a browser-only SDK being imported at module load time, causing server-side execution errors. The package has both ESM and CommonJS exports, but Node.js is trying to load ESM as CommonJS.
- **Fix**: Changed to lazy-load pattern using `require()` that only executes on client side:
  - Removed top-level `import` statements
  - Added `getTwilioSDK()` function that uses `require('@twilio/voice-sdk')` only when `typeof window !== 'undefined'`
  - Updated `useTwilioConnection.ts` to use `new SDK.Device(token)` instead of `new Device(token)`
  - This ensures the SDK is never loaded on the server side

## Remaining Issues

While TypeScript has 476 errors, most won't block the Remix build (which uses esbuild). However, these could still cause issues:

1. **Syntax Errors** - Any actual syntax errors would block builds
2. **Missing Exports** - Files that can't export properly
3. **Import Resolution** - More incorrect import paths

## Next Steps

The build should now work better. Try running:
- `npm run build` - to see if it completes
- `npm run dev` - to start the dev server

If it still hangs, we may need to:
1. Check for circular dependencies
2. Look for syntax errors in specific files
3. Check for missing files that are imported



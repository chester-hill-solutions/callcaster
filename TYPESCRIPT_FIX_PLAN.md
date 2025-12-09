# TypeScript Fix Plan

## Current Status
- **Total Errors**: 476 (typecheck hanging due to volume)
- **Fixed**: TableHeader.jsx → TableHeader.tsx

## Strategy

Since typecheck is hanging, we need to fix errors incrementally by:
1. Focusing on the most common error patterns first
2. Fixing specific files one at a time
3. Re-running typecheck after batches of fixes

## Most Common Error Patterns (from earlier analysis)

1. **Json Type Issues** (22+ errors)
   - "Property 'pages' does not exist on type Json"
   - "Property 'blocks' does not exist on type Json"
   - **Fix**: Add proper type guards/assertions for Json types

2. **Null Safety** (18+ errors)
   - "'prevScriptData' is possibly 'null'"
   - **Fix**: Add null checks or use optional chaining

3. **Type Mismatches** (50+ errors)
   - Parameter type mismatches
   - Missing properties on types
   - **Fix**: Add proper type annotations

## Next Steps

1. Fix Json type handling (biggest impact, ~30 errors)
2. Add null safety checks (~18 errors)
3. Fix type annotations incrementally
4. Re-run typecheck after each batch

## Files to Check

All the "not a module" files actually exist and have proper exports:
- ✅ useSupabaseRealtime.ts
- ✅ popover.tsx  
- ✅ AudienceForm.tsx
- ✅ ScriptBlock.tsx
- ✅ InviteCheckbox.tsx
- ✅ WorkspaceNav.tsx

These errors are likely cascading from other TypeScript errors, not actual missing modules.




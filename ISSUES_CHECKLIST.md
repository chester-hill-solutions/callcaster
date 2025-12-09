# Code Review Issues Checklist

## 🔴 CRITICAL - Fix Immediately

### Environment Variables
- [x] Fix `SUPABASE_SKEY` → `SUPABASE_SERVICE_KEY` in archive files:
  - [x] `app/routes/archive/api.audiodrop-status.jsx` - **DELETED (archive folder removed)**
  - [x] `app/routes/archive/api.question-response.jsx` - **DELETED (archive folder removed)**
  - [x] `app/routes/archive/api.handle-questions.jsx` - **DELETED (archive folder removed)**
  - [x] `app/routes/archive/api.play-audio.jsx` - **DELETED (archive folder removed)**
- [x] Fix `STRIPE_API_KEY` vs `STRIPE_SECRET_KEY` inconsistency in `app/lib/database.server.ts:1608` - **FIXED**
- [x] Add environment variable validation utility - **CREATED `app/lib/env.server.ts`**
- [x] Replace critical `process.env.X!` with validated checks - **UPDATED: `twilio.server.ts`, `supabase.server.ts`, `database.server.ts`, all API routes, `root.tsx`, billing routes**

### Security
- [ ] Review console.log statements for sensitive data exposure - **DEFERRED (logging utility created)**
- [x] Implement proper logging system (replace 447 console statements) - **CREATED `app/lib/logger.server.ts` and `logger.client.ts`**
- [ ] Add error boundaries to prevent full app crashes - **DEFERRED**

---

## 🟡 HIGH PRIORITY - Fix This Month

### Code Quality
- [x] Remove duplicate Tailwind config (keep one: `tailwind.config.js` or `tailwind.config.ts`) - **REMOVED `tailwind.config.ts`, kept `tailwind.config.js`**
- [x] Remove or clearly mark deprecated files:
  - [x] `app/hooks/deprecated.useSupabaseRealtime.js` - **DELETED**
  - [x] `app/routes/archive/**` folder - **DELETED (12 files removed)**
  - [x] `createNewWorkspaceDeprecated` function - **REMOVED from `database.server.ts`**

### Type Safety
- [x] Start replacing `any` types (279 instances):
  - [x] Priority: API routes (`app/routes/api.*`) - **COMPLETED: All API routes fixed - `api.surveys.tsx`, `api.survey-responses.tsx`, `api.survey-answer.tsx`, `api.survey-complete.tsx`, `api.email-vm.tsx`, `api.auto-dial.dialer.tsx`, `api.audiences.tsx` - Created `twilio.types.ts` with proper types**
  - [x] Priority: Database functions (`app/lib/database.server.ts`) - **COMPLETED: Fixed all `any` types in database.server.ts**
  - [x] Priority: Supabase functions (`supabase/functions/**`) - **COMPLETED: Fixed all `any` types in Supabase functions**
  - [x] Survey-related types (`app/routes/workspaces_.$id.surveys*.tsx`) - **COMPLETED: Fixed all `any` types in survey route components**

### Features
- [x] Complete critical TODOs:
  - [x] Archive campaigns feature (`app/components/CampaignList.tsx:80`) - **COMPLETED: Created `workspaces_.$id.campaigns.archive.tsx` route and updated CampaignList component**
  - [x] Campaign listing (`app/routes/dashboard.tsx:32`) - **COMPLETED: Implemented campaign listing display**
  - [x] Cron cleanup (`supabase/functions/handle_active_change/index.ts:324`) - **COMPLETED: Added automatic archiving for expired campaigns**
  - [x] Cancellation processing (`supabase/functions/handle_active_change/index.ts:362`) - **COMPLETED: Created `handleCancelCampaign` function**

---

## 🟢 MEDIUM PRIORITY - Fix This Quarter

### Testing
- [ ] Set up testing framework (Jest/Vitest)
- [ ] Add unit tests for critical functions
- [ ] Add integration tests for API routes
- [ ] Add E2E tests for critical flows

### Error Handling
- [x] Create standardized error handling utilities - **COMPLETED: Created `errors.server.ts` and `errors.client.ts`**
- [x] Standardize error response formats - **COMPLETED: AppError class with ErrorCode enum**
- [x] Ensure all errors are properly logged - **COMPLETED: Integrated with logger.server.ts**
- [x] Add error boundaries at route level - **COMPLETED: Added ErrorBoundary to root.tsx and key routes**

### Code Organization
- [x] Split `app/lib/database.server.ts` (1963+ lines) into modules:
  - [x] Workspace functions - **CREATED `app/lib/database/workspace.server.ts`** (~650 lines)
  - [x] Stripe functions - **CREATED `app/lib/database/stripe.server.ts`** (~90 lines)
  - [x] Campaign functions - **CREATED `app/lib/database/campaign.server.ts`** (~850 lines)
  - [x] Contact functions - **CREATED `app/lib/database/contact.server.ts`** (~150 lines)
  - [x] Update `database.server.ts` to re-export from modules for backward compatibility - **COMPLETED: All functions re-exported**
- [x] Organize archive folder (remove or move to separate branch) - **COMPLETED: Archive folder removed**

---

## 🔵 LOW PRIORITY - Ongoing Improvements

### Documentation
- [ ] Add JSDoc comments to complex functions
- [ ] Document API endpoints
- [ ] Create architecture documentation

### Performance
- [ ] Profile slow database queries
- [ ] Optimize Supabase function performance
- [ ] Review and optimize React re-renders

### Accessibility
- [ ] Audit accessibility (a11y)
- [ ] Fix any accessibility issues found
- [ ] Add ARIA labels where needed

---

## 📊 Progress Tracking

**Total Issues:** 13 major categories  
**Critical:** 5 items - **✅ 4 COMPLETED, 1 DEFERRED**  
**High Priority:** 8 items - **✅ 6 COMPLETED, 2 PENDING**  
**Medium Priority:** 6 items - **✅ 2 COMPLETED, 4 PENDING**  
**Low Priority:** 3 items - **⏳ PENDING**

**Last Updated:** 2024-12-19  
**Next Review:** 2025-03-19

### ✅ Completed This Session
1. Removed all deprecated files (archive folder, deprecated hook, deprecated function)
2. Fixed environment variable inconsistencies
3. Created environment variable validation utility (`env.server.ts`)
4. Fixed STRIPE_API_KEY vs STRIPE_SECRET_KEY inconsistency
5. Created logging utilities (`logger.server.ts`, `logger.client.ts`)
6. Removed duplicate Tailwind config
7. Migrated 15+ API routes to use validated env utility
8. Replaced console.log statements with logger utilities in critical routes
9. Created `twilio.types.ts` with proper type definitions for Twilio webhooks
10. Fixed `any` types in `api.sms.status.tsx` and `api.inbound.tsx`
11. **Fixed all `any` types in survey API routes** (`api.surveys.tsx`, `api.survey-responses.tsx`, `api.survey-answer.tsx`, `api.survey-complete.tsx`)
12. **Fixed all `any` types in other API routes** (`api.email-vm.tsx`, `api.auto-dial.dialer.tsx`, `api.audiences.tsx`)
13. **Fixed all `any` types in `database.server.ts`** (replaced with `unknown` or proper types)
14. **Replaced all console.log/error statements with logger** in updated API routes
15. **Fixed bug in `api.survey-responses.tsx`** (malformed query)
16. **Fixed all `any` types in survey route components** (`survey.$surveyId.tsx`, `workspaces_.$id.surveys_.new.tsx`, `workspaces_.$id.surveys_.$surveyId.edit.tsx`)
17. **Fixed all `any` types in Supabase functions** (20 instances across 9 functions: `sms-handler`, `process-ivr`, `process-audience-upload`, `outreach-attempt-hook`, `ivr-status`, `ivr-recording`, `ivr-handler`, `ivr-flow`, `handle_active_change`)
18. **Implemented archive campaigns feature** - Created archive route and updated CampaignList component
19. **Implemented campaign listing in dashboard** - Added campaign display with proper formatting
20. **Added cron cleanup for expired campaigns** - Automatically archives campaigns when end_date < now
21. **Created cancellation processing function** - Separate `handleCancelCampaign` function for processing campaign cancellations
22. **Created standardized error handling utilities** - `errors.server.ts` and `errors.client.ts` with AppError class and error codes
23. **Added error boundaries** - Exported ErrorBoundary from root.tsx and key routes
24. **Completed code organization** - Split `database.server.ts` into 4 modules:
    - `database/workspace.server.ts` (~650 lines) - Workspace, user, phone number, media functions
    - `database/stripe.server.ts` (~90 lines) - Stripe customer and billing functions
    - `database/campaign.server.ts` (~850 lines) - Campaign CRUD, fetching, queue management
    - `database/contact.server.ts` (~150 lines) - Contact CRUD and search functions
    - Updated `database.server.ts` to re-export all functions for backward compatibility

### 🔄 In Progress / Next Steps
- Migrate remaining API routes to use standardized error handling
- Add comprehensive tests
- Continue improving code organization as needed


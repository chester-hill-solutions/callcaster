# Component Reorganization Plan

## Overview

This document outlines a plan to reorganize the `/app/components` directory by area of concern to improve maintainability, discoverability, and developer experience.

## Current State Analysis

### Current Structure Issues

- **Flat structure**: Many components are at the root level, making it hard to find related components
- **Inconsistent naming**: Mix of naming conventions (e.g., `CampaignSettings.tsx` vs `CampaignSettings.Script.tsx` vs `CampaignSettingsQueue.tsx`)
- **Mixed concerns**: Components serving different purposes are grouped together
- **Duplicate concerns**: Some components are split across multiple files with unclear relationships
- **Scattered related components**: Related components are not co-located (e.g., CallScreen.\* components)

## Proposed Structure

```
app/components/
├── ui/                          # ✅ Already organized - Design system components
│   ├── accordion.tsx
│   ├── alert.tsx
│   ├── badge.tsx
│   ├── button.tsx
│   └── ... (all existing UI components)
│
├── shared/                      # 🆕 Shared/common components used across features
│   ├── ErrorBoundary.tsx
│   ├── SaveBar.tsx
│   ├── TablePagination.tsx
│   ├── CustomCard.tsx
│   ├── InfoPopover.tsx
│   ├── TransparentBGImage.tsx
│   ├── Icons.jsx
│   ├── theme-provider.tsx
│   └── mode-toggle.tsx
│
├── layout/                     # 🆕 Layout and navigation components
│   ├── Navbar.tsx
│   └── Navbar.MobileMenu.tsx
│
├── workspace/                  # 🆕 Workspace management
│   ├── WorkspaceOverview.tsx
│   ├── WorkspaceNav.tsx
│   ├── WorkspaceTable/
│   │   ├── DataTable.tsx
│   │   └── columns.tsx
│   ├── TeamMember.tsx
│   └── WebhookEditor.tsx
│
├── campaign/                   # 🆕 Campaign management
│   ├── CampaignList.tsx
│   ├── CampaignEmptyState.tsx
│   │
│   ├── settings/               # Campaign settings components
│   │   ├── CampaignSettings.tsx
│   │   ├── CampaignSettingsQueue.tsx
│   │   │
│   │   ├── basic/              # Basic info components
│   │   │   ├── CampaignBasicInfo.tsx
│   │   │   ├── CampaignBasicInfo.Dates.tsx
│   │   │   ├── CampaignBasicInfo.Schedule.tsx
│   │   │   ├── CampaignBasicInfo.SelectNumber.tsx
│   │   │   ├── CampaignBasicInfo.SelectStatus.tsx
│   │   │   └── CampaignBasicInfo.SelectType.tsx
│   │   │
│   │   ├── detailed/           # Detailed campaign settings
│   │   │   ├── CampaignDetailed.tsx
│   │   │   ├── CampaignDetailed.ActivateButtons.tsx
│   │   │   ├── CampaignDetailed.SelectScript.tsx
│   │   │   ├── CampaignDetailed.Voicemail.tsx
│   │   │   └── live/
│   │   │       ├── CampaignDetailed.Live.Switches.tsx
│   │   │       └── CampaignDetailed.Live.SelectVoiceDrop.tsx
│   │   │
│   │   └── script/              # Script-related settings
│   │       ├── CampaignSettings.Script.tsx
│   │       ├── CampaignSettings.Script.QuestionBlock.tsx
│   │       ├── CampaignSettings.Script.QuestionBlock.Option.jsx
│   │       └── CampaignSettings.Script.IVRQuestionBlock.tsx
│   │
│   └── home/                   # Campaign home screen components
│       ├── CampaignHeader.tsx
│       ├── CampaignNav.tsx
│       ├── CampaignInstructions.tsx
│       ├── CampaignResultDisplay.tsx
│       ├── MessageResultsScreen.tsx
│       ├── ResultsScreen.tsx
│       ├── ResultsScreen.Disposition.tsx
│       ├── ResultsScreen.ExportButton.tsx
│       ├── ResultsScreen.KeyMetrics.tsx
│       ├── ResultsScreen.TotalCalls.tsx
│       ├── AsyncExportButton.tsx
│       └── AdminAsyncExportButton.tsx
│
├── audience/                   # 🆕 Audience/Contact management
│   ├── AudienceTable.tsx
│   ├── AudienceForm.tsx
│   ├── AudienceContactRow.jsx
│   ├── AudienceUploader.tsx
│   └── AudienceUploadHistory.tsx
│
├── contact/                    # 🆕 Contact management
│   ├── ContactTable.tsx
│   ├── ContactForm.tsx
│   ├── ContactDetails.tsx
│   ├── ContactDetailsFields.tsx
│   ├── ContactDetailsOtherFields.tsx
│   └── RecentContacts.tsx
│
├── queue/                      # ✅ Already organized - Queue management
│   ├── QueueTable.tsx
│   ├── ContactSearchDialog.tsx
│   ├── QueueContent.tsx
│   ├── QueueHeader.tsx
│   ├── QueueTablePagination.tsx
│   └── StatusDropdown.tsx
│
├── call/                       # 🆕 Call-related components
│   ├── CallScreen.CallArea.tsx
│   ├── CallScreen.Dialogs.tsx
│   ├── CallScreen.DTMFPhone.tsx
│   ├── CallScreen.Header.tsx
│   ├── CallScreen.Household.tsx
│   ├── CallScreen.Questionnaire.tsx
│   ├── CallScreen.QueueList.tsx
│   └── CallScreen.TopBar.jsx
│
├── call-list/                  # 🆕 Call list/history components
│   ├── CallContact/
│   │   ├── CallContact.tsx
│   │   ├── ContactInfo.jsx
│   │   ├── Note.jsx
│   │   ├── Result.tsx
│   │   ├── Result.IconMap.tsx
│   │   └── SupportButton.jsx
│   ├── NewContactForm.jsx
│   └── TableHeader.jsx
│
├── script/                     # 🆕 Script/IVR builder components
│   ├── ScriptBlock.tsx
│   ├── Script.MainContent.tsx
│   └── Script.Sidebar.tsx
│
├── question/                   # 🆕 Question/Survey components
│   ├── QuestionCard.jsx
│   ├── QuestionCard.QuestionHeader.jsx
│   ├── QuestionCard.ResponseTable.jsx
│   ├── QuestionCard.ResponseTable.EditModal.jsx
│   └── QuestionCard.ScriptArea.jsx
│
├── chat/                       # ✅ Already organized - Chat components
│   ├── ChatAddContactDialog.tsx
│   ├── ChatHeader.tsx
│   ├── ChatImages.tsx
│   ├── ChatInput.tsx
│   └── ChatMessages.tsx
│
├── phone-numbers/              # 🆕 Phone number management
│   ├── NumbersTable.tsx
│   ├── NumberPurchase.tsx
│   ├── NumbersPurchase.EmptyState.tsx
│   └── NumberCallerId.tsx
│
├── media/                      # ✅ Already organized - Media components
│   └── columns.tsx
│
├── forms/                      # 🆕 Form components and inputs
│   ├── Inputs.jsx
│   ├── InputSelector.tsx
│   ├── OutputSelector.tsx
│   └── AudioSelector.tsx
│
├── settings/                   # 🆕 Settings components
│   ├── MessageSettings.jsx
│   └── Settings.VoxTypeSelector.jsx
│
├── invite/                     # 🆕 Invite/onboarding components
│   └── AcceptInvite/           # ✅ Already organized
│       ├── EmailField.tsx
│       ├── ErrorAlert.tsx
│       ├── ExistingUserInvites.tsx
│       ├── InviteCheckbox.tsx
│       ├── NameFields.tsx
│       ├── NewUserSignUp.tsx
│       └── PasswordFields.tsx
│
└── other-services/              # ✅ Already organized
    └── ServiceCard.tsx
```

## Migration Strategy

### Phase 1: Create New Structure (Non-Breaking)

1. Create new directory structure
2. Move components to new locations
3. Update all import statements across the codebase
4. Verify no broken imports

### Phase 2: Consolidation & Cleanup

1. **✅ Duplicate Components Removed**:

   - ✅ `AudienceTable.jsx` - Deleted (duplicate of `AudienceTable.tsx`)
   - ✅ `ChatHeader.tsx` (root) - Deleted (duplicate/incomplete, `Chat/ChatHeader.tsx` is correct)

2. **Naming Consistency**:

   - Consider renaming `CallScreen.*` components to `CallScreen.*` or `call-screen/*` for consistency
   - Standardize file extensions (prefer `.tsx` over `.jsx`)

3. **Component Grouping**:
   - Group related sub-components (e.g., `CampaignBasicInfo.*`) in subdirectories
   - Consider index files for easier imports

### Phase 3: Documentation

1. Create `README.md` in each major directory explaining its purpose
2. Document component relationships and dependencies
3. Add JSDoc comments for complex components

## Component Categories Breakdown

### 1. **UI Components** (`ui/`)

- **Purpose**: Reusable design system components
- **Status**: ✅ Already well-organized
- **Action**: Keep as-is

### 2. **Shared Components** (`shared/`)

- **Purpose**: Common components used across multiple features
- **Components**: ErrorBoundary, SaveBar, TablePagination, CustomCard, InfoPopover, Icons, theme-provider, mode-toggle
- **Action**: Create new directory and move components

### 3. **Layout Components** (`layout/`)

- **Purpose**: Navigation and layout structure
- **Components**: Navbar, Navbar.MobileMenu
- **Action**: Create new directory and move components
- **Note**: `WorkspaceSelectorCombobox.tsx` was deleted (unused)

### 4. **Workspace Components** (`workspace/`)

- **Purpose**: Workspace management and settings
- **Components**: WorkspaceOverview, WorkspaceNav, WorkspaceTable, TeamMember, WebhookEditor
- **Action**: Consolidate existing Workspace/ directory with root-level workspace components
- **Note**: `WorkspaceDropdown.tsx` was deleted (unused)

### 5. **Campaign Components** (`campaign/`)

- **Purpose**: Campaign creation, management, and viewing
- **Subdirectories**:
  - `settings/` - Campaign configuration
  - `home/` - Campaign dashboard/results
- **Action**: Create new structure and organize all campaign-related components
- **Note**: `CampaignAudienceSelection.tsx` and `CampaignMessagePreview.tsx` were deleted (unused)

### 6. **Audience Components** (`audience/`)

- **Purpose**: Audience/contact list management
- **Components**: AudienceTable, AudienceForm, AudienceUploader, AudienceUploadHistory
- **Action**: Create new directory and move components

### 7. **Contact Components** (`contact/`)

- **Purpose**: Individual contact management
- **Components**: ContactTable, ContactForm, ContactDetails, RecentContacts
- **Action**: Create new directory and move components

### 8. **Queue Components** (`queue/`)

- **Purpose**: Campaign queue management
- **Status**: ✅ Already well-organized
- **Action**: Keep as-is

### 9. **Call Components** (`call/`)

- **Purpose**: Active call interface components
- **Components**: All CallScreen.\* components
- **Action**: Create new directory and move components

### 10. **Call List Components** (`call-list/`)

- **Purpose**: Call history and call list views
- **Status**: ✅ Already organized in CallList/
- **Action**: Rename CallList/ to call-list/ for consistency

### 11. **Script Components** (`script/`)

- **Purpose**: Script/IVR builder interface
- **Components**: ScriptBlock, Script.MainContent, Script.Sidebar
- **Action**: Create new directory and move components
- **Note**: `ScriptPreview.jsx` was deleted (unused)

### 12. **Question Components** (`question/`)

- **Purpose**: Question/survey building and management
- **Components**: QuestionCard.\*
- **Action**: Create new directory and move components
- **Note**: `SurveyLinkGenerator.tsx` was deleted (unused)

### 13. **Chat Components** (`chat/`)

- **Purpose**: Chat interface
- **Status**: ✅ Already well-organized
- **Action**: Keep as-is

### 14. **Phone Numbers Components** (`phone-numbers/`)

- **Purpose**: Phone number management and purchasing
- **Components**: NumbersTable, NumberPurchase, NumberCallerId
- **Action**: Create new directory and move components

### 15. **Forms Components** (`forms/`)

- **Purpose**: Reusable form inputs and selectors
- **Components**: Inputs, InputSelector, OutputSelector, AudioSelector
- **Action**: Create new directory and move components

### 16. **Settings Components** (`settings/`)

- **Purpose**: Application settings
- **Components**: MessageSettings, Settings.VoxTypeSelector
- **Action**: Create new directory and move components

### 17. **Invite Components** (`invite/`)

- **Purpose**: User invitation and onboarding
- **Status**: ✅ Already organized in AcceptInvite/
- **Action**: Rename AcceptInvite/ to invite/ for consistency

## Import Path Updates Required

After reorganization, update imports from:

```typescript
// Old
import { CampaignSettings } from "~/components/CampaignSettings";
import { ContactTable } from "~/components/ContactTable";

// New
import { CampaignSettings } from "~/components/campaign/settings/CampaignSettings";
import { ContactTable } from "~/components/contact/ContactTable";
```

## Benefits of This Structure

1. **Discoverability**: Related components are grouped together
2. **Maintainability**: Easier to find and update related code
3. **Scalability**: Clear structure for adding new components
4. **Team Collaboration**: Clear ownership and organization
5. **Code Navigation**: Better IDE support and file tree navigation
6. **Onboarding**: New developers can understand structure quickly

## Potential Issues & Considerations

1. **Import Updates**: All imports will need to be updated (can use find/replace)
2. **Git History**: Moving files may affect git blame (use `git mv` to preserve history)
3. **Build System**: Ensure build system handles new paths correctly
4. **TypeScript Paths**: May need to update `tsconfig.json` path mappings
5. **Duplicate Components**: Need to resolve duplicates before migration

## Next Steps

1. ✅ Review and approve this plan
2. ✅ Create new directory structure
3. ✅ Move components (using `git mv` to preserve history)
4. ✅ Update all import statements
5. ✅ Run tests to verify no broken imports
6. ✅ Consolidate duplicate components
7. ⏳ Add directory README files (optional)
8. ⏳ Update documentation (optional)

## Notes

- Components marked with ✅ are already well-organized
- Components marked with 🆕 need new directories created
- Components marked with ⚠️ need attention (duplicates or inconsistencies)
- Consider using index files (`index.ts`) for easier imports in subdirectories
- May want to add barrel exports for cleaner imports

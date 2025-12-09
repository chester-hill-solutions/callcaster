# Non-Discoverable Routes

This document lists all route files that exist in the codebase but are **NOT discoverable** through normal navigation flow starting from `_index.tsx`.

## Summary

**Total Non-Discoverable Routes**: 13 routes

These routes exist but cannot be reached by clicking through the UI from the landing page. They may be:
- Accessible only via direct URL entry
- Called programmatically (API routes)
- Legacy/unused routes
- Admin-only routes without navigation links
- Authentication callbacks triggered by external services

**Note**: Dashboard routes (`dashboard.tsx` and `dashboard.$id.jsx`) have been removed as they were legacy/unused.

---

## Public Routes (Not Linked in Navigation)

### Services Pages
- `services.tsx` - Services page
  - **Status**: Commented out in Navbar component
  - **Access**: Direct URL only (`/services`)
  - **Note**: Link exists in code but is commented out: `{/* <NavButton to="/services">Services</NavButton> */}`

- `other-services.tsx` - Other services page
  - **Status**: Not linked anywhere in navigation
  - **Access**: Direct URL only (`/other-services`)
  - **Note**: No navigation link found

### Authentication Routes
- `auth.confirm.jsx` - Authentication confirmation handler
  - **Status**: Called by Supabase auth system, not user navigation
  - **Access**: Triggered by Supabase email links/auth callbacks
  - **Note**: This is a callback route, not meant for direct navigation
  - **Related**: Similar to `api.auth.callback.tsx` but uses different route pattern

---

## Admin Routes (No Public Navigation Links)

All admin routes exist but are **not linked** in the main navigation. They can only be accessed via direct URL entry.

### Admin Dashboard
- `admin.tsx` - Admin dashboard
  - **Status**: Not linked in main navigation
  - **Access**: Direct URL only (`/admin`)
  - **Note**: Admin users would need to know the URL or bookmark it

- `admin.fixed.tsx` - Admin fixed page
  - **Status**: Not linked in main navigation
  - **Access**: Direct URL only (`/admin/fixed`)
  - **Note**: Purpose unclear, appears to be a fixed/admin view

### Admin User Management
- `admin_.users.$userId.edit.tsx` - Edit user (admin)
  - **Status**: Linked from admin dashboard, but admin dashboard itself is not discoverable
  - **Access**: `/admin/users/{userId}/edit`
  - **Note**: Only discoverable if you already know about `/admin`

- `admin_.users.$userId.workspaces.tsx` - User workspaces (admin)
  - **Status**: Linked from admin dashboard, but admin dashboard itself is not discoverable
  - **Access**: `/admin/users/{userId}/workspaces`
  - **Note**: Only discoverable if you already know about `/admin`

### Admin Workspace Management
- `admin_.workspaces.$workspaceId.tsx` - Workspace admin view
  - **Status**: Linked from admin dashboard, but admin dashboard itself is not discoverable
  - **Access**: `/admin/workspaces/{workspaceId}`
  - **Note**: Only discoverable if you already know about `/admin`

- `admin_.workspaces.$workspaceId.campaigns.tsx` - Workspace campaigns admin
  - **Status**: Linked from admin workspace detail page
  - **Access**: `/admin/workspaces/{workspaceId}/campaigns`
  - **Note**: Only discoverable if you already know about `/admin`

- `admin_.workspaces.$workspaceId.users.tsx` - Workspace users admin
  - **Status**: Linked from admin workspace detail page
  - **Access**: `/admin/workspaces/{workspaceId}/users`
  - **Note**: Only discoverable if you already know about `/admin`

- `admin_.workspaces.$workspaceId.twilio.tsx` - Workspace Twilio settings admin
  - **Status**: Linked from admin workspace detail page
  - **Access**: `/admin/workspaces/{workspaceId}/twilio`
  - **Note**: Only discoverable if you already know about `/admin`

- `admin_.workspaces.$workspaceId_.invite.tsx` - Workspace invitation admin
  - **Status**: Linked from admin workspace detail page
  - **Access**: `/admin/workspaces/{workspaceId}/invite`
  - **Note**: Only discoverable if you already know about `/admin`

---

## Analysis by Category

### Routes That Should Be Linked

1. **Admin Routes** - Admin dashboard should have a link in the navigation (for admin users only)
   - Consider adding admin link to Navbar for users with admin role
   - Or add to user dropdown menu for admin users

2. **Services Pages** - If these pages are meant to be public, they should be linked
   - `services.tsx` - Uncomment the link in Navbar
   - `other-services.tsx` - Add navigation link if needed

### Routes That Are Intentionally Not Linked

1. **Authentication Callbacks** - Not meant for user navigation
   - `auth.confirm.jsx` - Called by Supabase auth system
   - These are callback routes, not user-facing pages

### Routes That May Need Review

1. **Admin Routes** - All admin functionality exists but requires direct URL access
   - This may be intentional for security (security through obscurity)
   - Or may need proper admin navigation menu

---

## Recommendations

### High Priority
1. **Add Admin Navigation** - If admin routes should be accessible:
   - Add admin link to Navbar (visible only to admin users)
   - Or add admin section to user dropdown menu
   - Consider role-based navigation visibility

### Medium Priority
3. **Services Pages** - Decide if these should be public:
   - If yes, uncomment/add navigation links
   - If no, consider removing or documenting as intentionally hidden

### Low Priority
4. **Documentation** - Document intentionally non-discoverable routes:
   - Create admin documentation with direct URLs
   - Document callback routes for developers

---

## Route Discovery Coverage

- **Total Routes**: ~118+ route files (after removing dashboard routes)
- **Discovered Routes**: ~105 routes (89%)
- **Non-Discoverable Routes**: 13 routes (11%)

### Breakdown:
- **Public Routes**: 2 non-discoverable (services pages)
- **Admin Routes**: 9 non-discoverable (all admin routes)
- **Auth Callbacks**: 1 non-discoverable (`auth.confirm.jsx`)
- **Removed**: 2 dashboard routes (legacy/unused - deleted)

---

## Notes

- API routes are intentionally not included in this analysis as they are not user-navigable routes
- Routes that redirect to other routes are still considered discoverable if the redirect target is discoverable
- Routes accessible only via direct URL entry are considered non-discoverable
- Admin routes that link to each other are still non-discoverable if the entry point (`/admin`) is not linked


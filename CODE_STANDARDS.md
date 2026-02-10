# Code Standards

This document outlines the coding standards, patterns, and conventions used in the NES Dashboard codebase. All code should follow these guidelines to maintain consistency and quality.

## Table of Contents

1. [File Organization](#file-organization)
2. [Naming Conventions](#naming-conventions)
3. [Import Organization](#import-organization)
4. [TypeScript Patterns](#typescript-patterns)
5. [Server-Side Code](#server-side-code)
6. [Client-Side Code](#client-side-code)
7. [Component Patterns](#component-patterns)
8. [Route Patterns](#route-patterns)
9. [Error Handling](#error-handling)
10. [Type Definitions](#type-definitions)
11. [Code Style](#code-style)

---

## File Organization

### Directory Structure

```
app/
├── components/          # Legacy component exports (transitioning to ui/)
├── context/            # React context providers
├── hooks/              # Custom React hooks
│   ├── core/          # Core/utility hooks
│   ├── domain/        # Domain-specific hooks (auth, contacts, etc.)
│   └── ui/            # UI-specific hooks
├── lib/                # Server-side and shared utilities
│   ├── admin/         # Admin-specific server functions
│   ├── auth/          # Auth-specific server functions
│   ├── contacts/      # Contact-specific server functions
│   ├── env/           # Environment configuration
│   ├── geo/           # Geographic utilities
│   ├── supabase/      # Supabase utilities
│   ├── types/         # Type definitions organized by domain
│   └── *.server.ts    # Server-only functions
├── routes/             # React Router route files
│   ├── admin/         # Admin routes
│   ├── dashboards/    # Dashboard routes
│   └── api.*.tsx      # API route handlers
├── types/              # Top-level type definitions
├── ui/                 # UI component library
│   ├── primitives/    # Basic UI components (Button, Input, etc.)
│   ├── layout/        # Layout components (Header, Footer, etc.)
│   ├── widgets/       # Complex UI widgets
│   └── domain/        # Domain-specific UI components
└── root.tsx           # Root route component
```

### File Naming Conventions

- **Route files**: Use kebab-case (e.g., `signup.invite.tsx`, `api.contacts.tsx`)
- **Component files**: Use kebab-case (e.g., `contacts-table.tsx`, `form-header.tsx`)
- **Server files**: Use `.server.ts` suffix (e.g., `auth.server.ts`, `contacts.server.ts`)
- **Type files**: Use kebab-case with `.ts` extension (e.g., `types.ts`, `common.ts`)
- **Index files**: Use `index.ts` or `index.tsx` for barrel exports

### Server vs Client Separation

- **Server-only code**: Files ending in `.server.ts` contain code that should never be bundled for the client
- **Shared utilities**: Files in `lib/` without `.server.ts` suffix can be used by both server and client
- **Client-only code**: Components, hooks, and UI code are client-only

---

## Naming Conventions

### Variables and Functions

- Use **camelCase** for variables, functions, and methods
- Use descriptive names that indicate purpose
- Boolean variables should start with `is`, `has`, `can`, or `should` (e.g., `isAuthenticated`, `hasAccess`, `canWrite`)

```typescript
// Good
const isAuthenticated = Boolean(session?.user);
const hasAdminAccess = profile?.role === "admin";
const contactCount = contacts.length;

// Bad
const auth = Boolean(session?.user);
const admin = profile?.role === "admin";
const cnt = contacts.length;
```

### Components

- Use **PascalCase** for component names
- Component names should be nouns or noun phrases
- Match component file name to component name

```typescript
// Good
export function ContactsTable({ contacts }: ContactsTableProps) { }
export const FormHeader = ({ title }: FormHeaderProps) => { }

// Bad
export function contactsTable({ contacts }) { }
export const form_header = ({ title }) => { }
```

### Types and Interfaces

- Use **PascalCase** for types and interfaces
- Use descriptive names that indicate what they represent
- Prefer `type` over `interface` unless you need declaration merging
- Suffix props types with `Props` (e.g., `ButtonProps`, `ContactsTableProps`)
- Suffix data types with descriptive names (e.g., `LoaderData`, `ActionData`)

```typescript
// Good
type LoaderData = {
  contacts: Contact[];
  totalCount: number;
};

type ContactsTableProps = {
  contacts: Contact[];
  onUpdate?: (id: number) => void;
};

// Bad
type Data = { }
type Props = { }
```

### Constants

- Use **UPPER_SNAKE_CASE** for module-level constants
- Use **camelCase** for local constants

```typescript
// Good
const MAX_PAGE_SIZE = 1000;
const DEFAULT_PAGE_SIZE = 50;

const currentPage = 1;
const pageSize = DEFAULT_PAGE_SIZE;

// Bad
const maxPageSize = 1000;
const current_page = 1;
```

### Database Columns

- Use **snake_case** for database column names (matches database schema)
- Convert to camelCase when used in TypeScript code when appropriate

```typescript
// Database column: first_name
// TypeScript: firstname or firstName (depending on type definition)
```

---

## Import Organization

### Import Order

1. React and React Router imports
2. Third-party library imports
3. Type-only imports (using `import type`)
4. Local imports using path aliases (`@lib/`, `@ui/`, `@hooks/`)
5. Relative imports (avoid when possible)

### Path Aliases

Use path aliases for cleaner imports:

- `@lib/` → `app/lib/`
- `@ui/` → `app/ui/`
- `@hooks/` → `app/hooks/`
- `~/` → `app/` (for types and root-level imports)

```typescript
// Good
import { useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/admin/columns";
import { requireAdmin } from "@lib/auth";
import { jsonOk, jsonError } from "@lib/http";
import { Button, Card } from "@ui/primitives";
import type { LoaderData } from "~/types/auth";

// Bad
import { requireAdmin } from "../../lib/auth";
import { Button } from "../../ui/primitives/button";
```

### Type Imports

Always use `import type` for type-only imports to improve tree-shaking:

```typescript
// Good
import type { Route } from "./+types/admin/columns";
import type { LoaderData, ActionData } from "~/types/auth";

// Bad
import { Route } from "./+types/admin/columns"; // Route is a type
```

### Barrel Exports

Use barrel exports (`index.ts`) to organize exports:

```typescript
// app/ui/index.ts
export * as primitives from "./primitives";
export * as layout from "./layout";
export * as widgets from "./widgets";
```

---

## TypeScript Patterns

### Type Definitions

- Define types close to where they're used, or in dedicated type files
- Use descriptive type names
- Prefer `type` over `interface` unless you need declaration merging
- Export types that are used across multiple files

```typescript
// Good - Local type for route-specific data
type LoaderData = {
  contacts: Contact[];
  totalCount: number;
};

// Good - Shared type in types/ directory
export type Contact = {
  id: number;
  firstname: string | null;
  surname: string | null;
};

// Bad - Vague naming
type Data = { }
type Props = { }
```

### Type Guards

Use type guards for runtime type checking:

```typescript
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const err = error as { status?: number; code?: string };
    return err.status === 429 || err.code === "over_request_rate_limit";
  }
  return false;
}
```

### Generic Types

Use generic types for reusable utilities:

```typescript
function buildAccessScope<
  T extends { can_write: boolean } & Record<string, string | boolean>,
>(rows: T[], keyField: keyof T, labelField?: keyof T): AccessScope[] {
  // ...
}
```

### Optional vs Nullable

- Use `| null` for values that can explicitly be null
- Use `?` for optional properties
- Prefer `| null` over `| undefined` for database values

```typescript
// Good
type Contact = {
  id: number;
  firstname: string | null;  // Can be null
  email?: string;             // Optional property
};

// Bad
type Contact = {
  id: number;
  firstname?: string | null;  // Confusing - is it optional or nullable?
};
```

---

## Server-Side Code

### Server File Pattern

All server-only code should be in files ending with `.server.ts`:

```typescript
// lib/contacts.server.ts
import { getServiceSupabase } from "./supabase.server";

export async function updateContactField(
  contactId: number,
  field: string,
  value: string | null,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Implementation
}
```

### Return Value Pattern

Server functions should return a consistent result pattern:

```typescript
// Success case
return { success: true, data: result };

// Error case
return { success: false, error: "Error message" };
```

### Authentication and Authorization

Always check authentication and authorization in server functions:

```typescript
// Require authentication
const { profile } = await requireProfile(request);

// Require admin access
const { profile } = await requireAdmin(request);

// Check specific permissions
if (profile.role !== "admin" && profile.role !== "super_admin") {
  throw new Response("Forbidden", { status: 403 });
}
```

### HTTP Response Helpers

Use `jsonOk` and `jsonError` helpers from `@lib/http`:

```typescript
import { jsonOk, jsonError } from "@lib/http";

// Success response
return jsonOk({ data: result });

// Error response
return jsonError({ error: "Error message" }, 400);
```

### Error Handling

- Use `throw new Response()` for HTTP errors
- Include appropriate status codes
- Provide meaningful error messages

```typescript
// Good
if (!contactId || typeof contactId !== "number") {
  throw new Response("Invalid contact ID", { status: 400 });
}

if (updateRes.error) {
  return { success: false, error: updateRes.error.message };
}

// Bad
if (!contactId) {
  throw new Error("Invalid");
}
```

### Database Queries

- Use `getServiceSupabase()` for service role queries
- Use `initServerSupabase(request)` for user-scoped queries
- Always handle errors from Supabase queries
- Use type assertions when necessary for Supabase's generic types

```typescript
const service = getServiceSupabase();

const result = await service
  .from("contact")
  .select("*")
  .eq("id", contactId)
  .maybeSingle();

if (result.error) {
  return { success: false, error: result.error.message };
}

return { success: true, data: result.data };
```

### Supabase Edge Functions

- For Edge Function-to-Edge Function calls (e.g. `queue-next`, `ivr-handler`, `sms-handler`), the Edge runtime must have **EDGE_FUNCTION_JWT** set to the **legacy JWT service-role key** (not an `sb_secret_*` key). Set it in the Supabase dashboard or via `supabase secrets set EDGE_FUNCTION_JWT <jwt>`. (Supabase reserves the `SUPABASE_` prefix for built-in env vars.)

---

## Client-Side Code

### React Hooks

- Use React Router hooks for data loading: `useLoaderData`, `useActionData`, `useNavigation`
- Use custom hooks for reusable logic
- Follow Rules of Hooks (only call hooks at the top level)

```typescript
export default function Component() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  
  // Component logic
}
```

### State Management

- Use `useState` for local component state
- Use `useMemo` for expensive computations
- Use `useCallback` for memoized callbacks passed to children
- Use `useRef` for values that don't trigger re-renders

```typescript
const [isOpen, setIsOpen] = useState(false);
const sortedContacts = useMemo(
  () => contacts.sort((a, b) => a.name.localeCompare(b.name)),
  [contacts]
);
const handleClick = useCallback(() => {
  setIsOpen(true);
}, []);
```

### Form Handling

- Use React Router's `Form` component for form submissions
- Use `useSubmit` for programmatic form submissions
- Include `_action` field to distinguish between different form actions

```typescript
const submit = useSubmit();

<Form method="post">
  <input type="hidden" name="_action" value="create_contact" />
  <Input name="name" />
  <Button type="submit">Create</Button>
</Form>

// Programmatic submission
const formData = new FormData();
formData.append("_action", "update_contact");
formData.append("id", String(contactId));
submit(formData, { method: "post" });
```

---

## Component Patterns

### Component Structure

1. Imports
2. Type definitions (if local)
3. Component function
4. Helper components (if any)

```typescript
import { useState } from "react";
import { Button } from "@ui/primitives";

type ComponentProps = {
  title: string;
  onAction: () => void;
};

export default function Component({ title, onAction }: ComponentProps) {
  // Component implementation
}

// Helper component
function HelperComponent() {
  // Implementation
}
```

### Component Props

- Always define props types
- Use descriptive prop names
- Make optional props explicit with `?`
- Provide default values when appropriate

```typescript
// Good
type ButtonProps = {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};

// Bad
type ButtonProps = {
  variant: any;
  onClick: Function;
};
```

### Component Composition

- Prefer composition over configuration
- Use children prop for flexible content
- Extract complex logic into custom hooks

```typescript
// Good
<Card>
  <CardHeader>{title}</CardHeader>
  <CardContent>{children}</CardContent>
</Card>

// Bad
<Card header={title} content={children} />
```

### Conditional Rendering

- Use early returns for guard clauses
- Use ternary operators for simple conditionals
- Use `&&` for conditional rendering when appropriate

```typescript
// Good
if (!isAuthenticated) {
  return <Redirect to="/login" />;
}

return (
  <div>
    {isLoading ? <Spinner /> : <Content />}
    {error && <ErrorMessage error={error} />}
  </div>
);

// Bad
return (
  <div>
    {isAuthenticated ? (
      <div>
        {isLoading ? <Spinner /> : <Content />}
      </div>
    ) : null}
  </div>
);
```

---

## Route Patterns

### Route File Structure

Route files should export:
1. `loader` function (async, server-only)
2. `action` function (async, server-only, optional)
3. Default component export (client component)
4. `meta` function (optional, for SEO)
5. `links` function (optional, for resource hints)

```typescript
import type { Route } from "./+types/admin/columns";

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  // Load data
  return jsonOk(data, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const actionType = String(formData.get("_action") ?? "");
  // Handle action
  return jsonOk({ success: true });
}

export default function RouteComponent() {
  const data = useLoaderData<LoaderData>();
  // Render component
}
```

### Loader Pattern

- Always require appropriate authentication
- Return data using `jsonOk` helper
- Include headers from auth functions
- Handle errors appropriately

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  const { headers, profile } = await requireProfile(request);
  
  // Load data
  const result = await loadData(profile.id);
  
  if (!result.success) {
    throw new Response(result.error, { status: 500 });
  }
  
  return jsonOk({ data: result.data }, { headers });
}
```

### Action Pattern

- Parse request body (form or JSON)
- Validate input
- Perform action
- Return appropriate response

**Request parsing**: Use `parseActionRequest(request)` from `~/lib/database.server` when the action may receive either FormData (from `<Form>`) or JSON (from `fetcher.submit` with `encType: "application/json"`). This prevents silent failures when callers submit JSON but the action only reads formData.

**Fetcher–action alignment checklist** (for new actions):
1. Does the caller use `encType: "application/json"`? If yes, the action must handle JSON.
2. Use `parseActionRequest` to support both form and JSON bodies.
3. For array fields (e.g. `contact_ids[]`), `parseActionRequest` collects duplicate form keys into arrays.

```typescript
import { parseActionRequest } from "~/lib/database.server";

export async function action({ request }: Route.ActionArgs) {
  const data = await parseActionRequest(request);
  const actionType = String(data._action ?? data.intent ?? "").trim().toLowerCase();
  
  if (!actionType) {
    return jsonError({ error: "Missing action." }, 400);
  }
  
  if (actionType === "create_item") {
    const { profile } = await requireAdmin(request);
    const name = String(data.name ?? "").trim();
    
    if (!name) {
      return jsonError({ error: "Name is required." }, 400);
    }
    
    const result = await createItem(name, profile.id);
    if (!result.success) {
      return jsonError({ error: result.error }, 400);
    }
    
    return jsonOk({ success: "Item created successfully." });
  }
  
  return jsonError({ error: "Unsupported action." }, 400);
}
```

**Routes already using `parseActionRequest`**: api.contact-audience, api.contact-audience.bulk-delete, api.audiences, api.campaigns, workspaces_.$id.campaigns.$selected_id.settings, workspaces_.$id.campaigns.$selected_id.queue.

**Twilio webhooks**: Routes that receive callbacks from Twilio (e.g. api.ivr.status, api.dial.status, api.auto-dial.status, api.call-status, api.sms.status, api.inbound-sms, api.ivr.$campaignId.$pageId, api.ivr.$campaignId.$pageId.$blockId.response, archive/*) receive `application/x-www-form-urlencoded` only. Use `request.formData()` directly. Do not use `parseActionRequest` for these routes—they never receive JSON from our app. **Validate `X-Twilio-Signature`** using `validateTwilioWebhook` or `validateTwilioWebhookParams` from `~/twilio.server` before processing; reject with 403 if invalid.

**JSON parse safety**: For routes that parse JSON, use `safeParseJson(request)` from `~/lib/database.server` instead of `request.json()` to avoid 500s from malformed JSON—it returns 400 on parse errors. Routes that use `parseActionRequest` already benefit from this.

**Error handling**: Use `createErrorResponse(error, defaultMessage)` from `~/lib/errors.server` in API route catch blocks for consistent error responses and logging.

**Input validation**: Validate and sanitize user input before processing. For JSON strings in formData (e.g. `formData.get("surveyData")`), wrap `JSON.parse` in try/catch and return 400 on failure. For public forms (e.g. contact form), validate email format, message length limits, and required fields.

**Resource access**: When `workspace_id` or `campaign_id` comes from the request body, call `requireWorkspaceAccess({ supabaseClient, user, workspaceId })` from `~/lib/database.server` as defense-in-depth (RLS is the primary guard).

### Route Data Types

Define types for loader and action data:

```typescript
type LoaderData = {
  items: Item[];
  totalCount: number;
};

type ActionData = { error?: string; success?: string } | undefined;
```

---

## API Patterns

### API Route Structure

All API routes should be under `/api/v1/` and use the API layout middleware. The middleware provides:
- **Logging**: Automatic request/response logging to database
- **Rate Limiting**: Per-token and per-IP rate limiting
- **Authentication**: Session-based or API token-based authentication

```typescript
// routes/api.v1.contacts.tsx
import type { Route } from "./+types/api.v1.contacts";
import { apiProfileContext } from "~/lib/api/v1/context";
import { jsonOk, jsonError, parsePaginationParams, createPaginatedResponse } from "~/lib/api/v1/utils";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Get authenticated profile from middleware context
  const profile = context.get(apiProfileContext);
  if (!profile) {
    return jsonError({ error: "Unauthorized" }, 401);
  }
  
  // API logic here
  return jsonOk({ data: result });
}
```

### Authentication

API routes support two authentication methods:

1. **Session-based**: Standard browser session cookies
2. **Token-based**: API tokens via `Authorization: Bearer <token>` header

The middleware automatically handles both. Access the authenticated profile via context:

```typescript
import { apiProfileContext } from "~/lib/api/v1/context";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Profile is set by middleware if authentication succeeds
  const profile = context.get(apiProfileContext);
  
  if (!profile) {
    return jsonError({ error: "Unauthorized" }, 401);
  }
  
  // Use profile for authorization checks
  if (profile.role !== "admin" && profile.role !== "super_admin") {
    return jsonError({ error: "Forbidden" }, 403);
  }
}
```

### API Response Patterns

Use consistent response helpers from `~/lib/api/v1/utils`:

```typescript
import { jsonOk, jsonError, createPaginatedResponse } from "~/lib/api/v1/utils";

// Success response
return jsonOk({ data: result });

// Error response
return jsonError({ error: "Error message" }, 400);

// Paginated response
return createPaginatedResponse(items, totalCount, page, pageSize);
```

### Pagination

All list endpoints should support pagination:

```typescript
import { parsePaginationParams, createPaginatedResponse } from "~/lib/api/v1/utils";

export async function loader({ request, context }: Route.LoaderArgs) {
  const profile = context.get(apiProfileContext);
  if (!profile) return jsonError({ error: "Unauthorized" }, 401);
  
  const url = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(url.searchParams);
  
  // Fetch data with pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  const { data, error, count } = await service
    .from("table")
    .select("*", { count: "exact" })
    .range(from, to);
  
  if (error) {
    return jsonError({ error: error.message }, 500);
  }
  
  return createPaginatedResponse(data || [], count || 0, page, pageSize);
}
```

### Sorting

Support sorting via query parameters:

```typescript
import { parseSortParams } from "~/lib/api/v1/utils";

const { sortBy, sortOrder } = parseSortParams(url.searchParams);

if (sortBy) {
  query = query.order(sortBy, { ascending: sortOrder === "asc" });
}
```

### API Token Management

- Only `super_admin` users can create API tokens
- Tokens are hashed before storage (never store plain tokens)
- Tokens can have optional expiration dates
- Tokens are associated with a user profile
- Use `~/lib/api/v1/tokens.server` utilities for token operations

```typescript
import { createApiToken, revokeApiToken, validateApiToken } from "~/lib/api/v1/tokens.server";

// Create token (super_admin only)
const { token, tokenRecord } = await createApiToken(
  profileId,
  createdBy,
  name,
  expiresAt // optional
);

// Validate token (done automatically by middleware)
const result = await validateApiToken(bearerToken);

// Revoke token
await revokeApiToken(tokenId);
```

### Rate Limiting

Rate limiting is automatically applied by middleware:
- **Per-token**: 1000 requests per hour (when using API token)
- **Per-IP**: 100 requests per hour (when using session auth)

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Timestamp when limit resets

### Logging

All API requests are automatically logged to the `api_logs` table with:
- Request ID (unique per request)
- Method, path, IP, user agent
- Status code, duration, response size
- Associated profile_id and token_id
- Error messages and stack traces (if any)

Access logs via:
- `/api/v1/tokens/:id/logs` - Logs for a specific token
- Admin view at `/admin/api-tokens` - All token logs

### Error Responses

Use consistent error response format:

```typescript
// Bad Request (400)
return jsonError({ error: "Bad Request", message: "Invalid input" }, 400);

// Unauthorized (401)
return jsonError({ error: "Unauthorized", message: "Authentication required" }, 401);

// Forbidden (403)
return jsonError({ error: "Forbidden", message: "Insufficient permissions" }, 403);

// Not Found (404)
return jsonError({ error: "Not Found", message: "Resource not found" }, 404);

// Internal Server Error (500)
return jsonError({ error: "Internal Server Error", message: error.message }, 500);
```

### API Versioning

- All API routes are under `/api/v1/`
- Use the API layout (`routes/api.v1.$layout.tsx`) for middleware
- Maintain backward compatibility within v1
- Document breaking changes in API changelog

### API Documentation

- Interactive API docs available at `/api/v1/docs` (requires admin or API token)
- OpenAPI spec available at `/api/v1/openapi.json`
- Keep OpenAPI spec up-to-date with route changes
- Use descriptive endpoint names and parameter descriptions

### Context Usage

The middleware provides context values accessible in route handlers:

```typescript
import {
  apiProfileContext,
  requestIdContext,
  rateLimitContext,
  tokenIdContext,
} from "~/lib/api/v1/context";

// Get authenticated profile
const profile = context.get(apiProfileContext);

// Get request ID (for logging/correlation)
const requestId = context.get(requestIdContext);

// Get rate limit info
const rateLimit = context.get(rateLimitContext);

// Get token ID (if using token auth)
const tokenId = context.get(tokenIdContext);
```

**Note**: Context values may not be set for all routes. Wrap `context.get()` calls in try-catch or check for existence:

```typescript
let profile: ProfileRow | undefined;
try {
  profile = context.get(apiProfileContext);
} catch {
  // Profile not set in context
}
```

---

## Error Handling

### Server-Side Errors

- Use `throw new Response()` for HTTP errors
- Include appropriate status codes (400, 401, 403, 404, 500)
- Provide meaningful error messages

```typescript
// Validation error
if (!email || !isValidEmail(email)) {
  throw new Response("Invalid email address", { status: 400 });
}

// Authorization error
if (profile.role !== "admin") {
  throw new Response("Forbidden", { status: 403 });
}

// Not found
if (!contact) {
  throw new Response("Contact not found", { status: 404 });
}
```

### Client-Side Error Display

- Display errors from `useActionData`
- Show user-friendly error messages
- Use Alert component for error display

```typescript
const actionData = useActionData<ActionData>();

return (
  <div>
    {actionData?.error && (
      <Alert variant="error">{actionData.error}</Alert>
    )}
    {actionData?.success && (
      <Alert variant="success">{actionData.success}</Alert>
    )}
  </div>
);
```

### Error Boundaries

- Use ErrorBoundary component for route-level error handling
- Provide fallback UI for errors
- Log errors appropriately

```typescript
export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.statusText || details;
  }
  
  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
    </main>
  );
}
```

---

## Type Definitions

### Type Organization

- **Domain types**: Place in `lib/types/{domain}/types.ts`
- **Shared types**: Place in `types/` directory
- **Route-specific types**: Define locally in route files
- **Component prop types**: Define with component or in separate type file

### Type Naming

- Use descriptive names
- Suffix props with `Props`
- Suffix data types with `Data` (e.g., `LoaderData`, `ActionData`)
- Use singular for entity types (e.g., `Contact`, not `Contacts`)

```typescript
// Entity type
export type Contact = {
  id: number;
  firstname: string | null;
};

// Props type
export type ContactsTableProps = {
  contacts: Contact[];
  onUpdate?: (id: number) => void;
};

// Data type
type LoaderData = {
  contacts: Contact[];
  totalCount: number;
};
```

### Database Types

- Use `ProfileRow`, `ContactRow`, etc. for database row types
- Define in `lib/types/database/` directory
- Match database column names exactly

```typescript
export type ProfileRow = {
  id: string;
  first_name: string | null;
  surname: string | null;
  role: "member" | "admin" | "super_admin";
  // ... other database columns
};
```

### Result Types

Use consistent result types for async operations:

```typescript
type Result<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Usage
async function loadData(): Promise<Result<Contact[]>> {
  // Implementation
}
```

---

## Code Style

### Formatting

- Use 2 spaces for indentation
- Use semicolons
- Use single quotes for strings (or double quotes, be consistent)
- Use trailing commas in multi-line objects and arrays
- Maximum line length: 100 characters (soft limit)

### Comments

- Use JSDoc comments for exported functions
- Use inline comments to explain "why", not "what"
- Remove commented-out code before committing

```typescript
/**
 * Update a contact's ride request status
 * @param contactId - The ID of the contact to update
 * @param status - The new ride request status
 * @param userId - The ID of the user making the update
 * @returns Result object with success status and optional error message
 */
export async function updateRideRequestStatus(
  contactId: number,
  status: RideRequestStatus | null,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Implementation
}
```

### Function Declarations

- Use `async function` for async functions
- Use arrow functions for callbacks and short functions
- Use function declarations for exported functions

```typescript
// Good - Exported function
export async function loadContacts(): Promise<Contact[]> {
  // Implementation
}

// Good - Callback
const handleClick = useCallback(() => {
  setIsOpen(true);
}, []);

// Good - Short utility
const formatName = (first: string, last: string) => `${first} ${last}`;
```

### Destructuring

- Use destructuring for props and objects
- Use rest parameters when appropriate

```typescript
// Good
export default function Component({ title, onAction, ...props }: ComponentProps) {
  const { profile, session } = useAuth();
}

// Bad
export default function Component(props: ComponentProps) {
  const auth = useAuth();
  const profile = auth.profile;
}
```

### Early Returns

- Use early returns to reduce nesting
- Return early for error cases and guard clauses

```typescript
// Good
export async function loader({ request }: Route.LoaderArgs) {
  const { profile } = await requireProfile(request);
  
  if (!profile) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const data = await loadData(profile.id);
  return jsonOk({ data });
}

// Bad
export async function loader({ request }: Route.LoaderArgs) {
  const { profile } = await requireProfile(request);
  
  if (profile) {
    const data = await loadData(profile.id);
    return jsonOk({ data });
  } else {
    throw new Response("Unauthorized", { status: 401 });
  }
}
```

### Null/Undefined Handling

- Use nullish coalescing (`??`) for default values
- Use optional chaining (`?.`) for safe property access
- Explicitly handle null/undefined cases

```typescript
// Good
const name = formData.get("name") ?? "";
const email = profile?.email ?? null;
const count = items?.length ?? 0;

// Bad
const name = formData.get("name") || "";
const email = profile && profile.email;
const count = items ? items.length : 0;
```

---

## Additional Guidelines

### Performance

- Use `useMemo` for expensive computations
- Use `useCallback` for callbacks passed to memoized components
- Lazy load heavy components with `React.lazy`
- Avoid unnecessary re-renders

### Accessibility

- Use semantic HTML elements
- Include ARIA labels where appropriate
- Ensure keyboard navigation works
- Test with screen readers

### Security

- Never trust client-side input
- Always validate and sanitize server-side
- Use parameterized queries (Supabase handles this)
- Check authorization on every request

### Testing

- Write tests for critical business logic
- Test error cases
- Test edge cases
- Keep tests simple and focused

---

## Changelog Maintenance

### Changelog Format

Maintain a `CHANGELOG.md` file following the [Keep a Changelog](https://keepachangelog.com/) format:

- Use semantic versioning for releases
- Group changes by type: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
- Include an `[Unreleased]` section for upcoming changes
- Date releases in `YYYY-MM-DD` format

### When to Update the Changelog

Update the changelog for:
- **New features**: Add to `Added` section
- **Breaking changes**: Add to `Changed` or `Removed` section with migration notes
- **Bug fixes**: Add to `Fixed` section
- **Security fixes**: Add to `Security` section
- **Deprecations**: Add to `Deprecated` section with removal timeline

### Changelog Entry Format

```markdown
## [Unreleased]

### Added
- New feature description
- Another new feature

### Changed
- Changed behavior description
- Breaking change: migration instructions

### Fixed
- Bug fix description

### Security
- Security fix description
```

### API Changes

When making API changes, document:
- New endpoints in `Added`
- Modified endpoints in `Changed` (note breaking changes)
- Deprecated endpoints in `Deprecated` (include removal date)
- Removed endpoints in `Removed`

Example:
```markdown
### Added
- `GET /api/v1/tokens/:id/logs` - Retrieve API logs for a specific token

### Changed
- `GET /api/v1/contacts` - Now requires authentication (breaking change)

### Deprecated
- `GET /api/v1/old-endpoint` - Will be removed in v2.0.0, use `/api/v1/new-endpoint` instead
```

### Release Process

1. Move `[Unreleased]` changes to a new version section
2. Add release date
3. Tag the release in git
4. Create a new `[Unreleased]` section for future changes

### Best Practices

- **Be descriptive**: Write clear, user-facing descriptions
- **Group related changes**: Keep similar changes together
- **Link to issues/PRs**: Reference related issues or pull requests when helpful
- **Update on merge**: Update changelog when merging features, not just on release
- **Review during PR**: Include changelog updates in pull request reviews

---

## Summary

This codebase follows these key principles:

1. **Separation of Concerns**: Server code (`.server.ts`), client code (components), and shared utilities are clearly separated
2. **Type Safety**: Extensive use of TypeScript types for safety and documentation
3. **Consistent Patterns**: Standardized patterns for routes, components, and server functions
4. **Clear Organization**: Logical directory structure with domain-based organization
5. **Error Handling**: Consistent error handling patterns throughout
6. **Code Reusability**: Shared utilities, components, and hooks to avoid duplication

When in doubt, follow existing patterns in the codebase and prioritize consistency over personal preference.


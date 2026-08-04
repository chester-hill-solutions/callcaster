# RR8 product middleware trees

React Router 8 route middleware injects auth context on three layout trees before child loaders/actions run. Middleware sets context and calls `next()` without writing a response body. Child handlers read context via typed getters; they do not re-run session or membership checks that middleware already performed.

## Three trees

| Layout | Middleware | Context key | Getter |
|---|---|---|---|
| `workspaces+/$id` | `workspaceMiddleware` | `workspaceContext` | `getWorkspaceRouteContext` |
| `api+/workspaces+/$workspaceId` | `dataPlaneMiddleware` | `dataPlaneAuthContext` | `getDataPlaneRouteContext` |
| `admin+/` | `adminMiddleware` (sudo-only) | `adminContext` | `getAdminRouteContext` |

Non-members of a workspace receive a uniform **404** (not 403) from workspace middleware to avoid workspace-id inference.

## Session-only routes

Routes without a workspace or admin segment in the URL use `createAuthLayoutLoader` (thin adapter until `@chester-hill-solutions/auth-react-router` is installable from GitHub Packages) or inline `verifyAuth` for hybrid/public flows. There is no fourth “session middleware” tree.

## Inline auth exclusions

Twilio webhooks, `/api/jobs/*`, Stripe return URLs, flat dual-auth API routes, and public/auth-hybrid flows keep inline `verifyAuth` or dual-auth helpers. See AGENTS.md exclusion table.

## SSE under data-plane middleware

`/api/workspaces/:workspaceId/events` is a child of the data-plane layout. Middleware resolves session/API-key auth and sets `dataPlaneAuthContext`. The events loader reads that context and returns a streaming `Response` directly. Parent middleware must not write a response body or merge loader output into the stream (see ADR-0005).

## Admin portal and invites

`admin+/` is sudo-only. Cross-workspace invite management for operators stays at `admin+/workspaces/:workspaceId/invite` (sudo-only). Workspace owners and admins invite members via workspace settings and the members API.

## Deferred

- `@react-router/fs-routes` — keep `remix-flat-routes` + route-tree baselines
- CHS `@chester-hill-solutions/auth-react-router` package swap — post-merge once GitHub Packages auth is configured

## Considered Options

- **Single global auth middleware** — cannot express workspace vs admin vs data-plane scoping in one tree.
- **Fourth session middleware tree** — duplicates auth-layout loader pattern; rejected.
- **SSE outside data-plane tree** — would duplicate auth; rejected in favor of context-only parent middleware.

## References

- `app/lib/workspace-middleware.server.ts`, `app/lib/data-plane-middleware.server.ts`, `app/lib/admin-middleware.server.ts`
- `app/lib/route-context.server.ts`
- `app/lib/auth-layout.server.ts`
- ADR-0005 (SSE transport)

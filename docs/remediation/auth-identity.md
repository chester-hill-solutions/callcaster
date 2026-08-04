# Auth & Identity Remediation

## Summary

The auth & identity slice has broken critical-path flows (forgot password, sign-out, accept-invite) and an under-configured Better Auth instance. The biggest risks are account takeover, workspace creation confused-deputy, and open redirects.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `remember.action.server.ts` | Calls `auth.api.resetPassword` instead of `auth.api.requestPasswordReset`; users never get reset emails. | Use `requestPasswordReset`; redirect to token-consuming page. |
| Critical | `reset-password.loader/action.server.ts` | Requires a live session to load reset page; action has no token field. | Remove session requirement; accept `token` from URL; validate and call `resetPassword`. |
| Critical | `platform-auth.server.ts` | `changePassword` falls back to `body.password` as `currentPassword` if `current_password` is omitted. | Require `current_password` in schema; reject if missing. |
| Critical | `workspaces+/index.action.server.ts` | HTML workspace creation uses `userId` from form body, not `user.id`. Any authenticated user can create a workspace for another user. | Use `user.id` from `verifyAuth`; remove hidden `userId` field. |
| High | `signin.action.server.ts`, `auth.server.ts` | `next` param validated only with `startsWith("/")`; allows `//evil.com`, encoded slashes. | Implement strict relative-path validator. |
| High | `platform-auth.server.ts` | `getMeProfile` calls `getSession` with empty `Headers`, never returns the user. | Pass original request headers or look up `auth_user` directly. |
| High | `root.tsx` | Sign-out fetcher POSTs to `/api/auth/sign-out` instead of `/api/auth/signout`. | Fix URL. |
| High | `platform-auth.server.ts` | `signOutUser` does not use `returnHeaders: true`; session cookie stays in browser. | Merge `Set-Cookie` headers and return them. |
| Critical | `accept-invite.action.server.ts` | `(request as any).updateUser(...)` — `Request` has no such method. | Use `auth.api.updateUser` or `signUpEmail` with correct payload. |
| High | `workspace.server.ts` | `acceptWorkspaceInvitations` accepts any invitation IDs without checking they belong to the authenticated user. | Add `eq(workspace_invite.user_id, userId)` filter; wrap in transaction. |
| Medium | `auth-instance.ts` | `auth` exported as `any`, losing type safety. | Type the proxy with Better Auth types; remove `as any` casts. |
| Medium | `api+/auth/[...all].route.tsx` | Catch-all forwards all Better Auth endpoints; duplicates explicit routes. | Restrict to allowed endpoints; disable unused plugins. |
| High | `platform-rate-limit.server.ts` | In-memory `Map` not shared across instances; trusts `X-Forwarded-For`. | Move to Redis/Postgres; use trusted platform client IP. |
| Medium | `signin.action.server.ts` | HTML form has no rate limiting. | Apply same rate limit as JSON token endpoint. |
| Medium | `platform-auth.ts` | Password policy is `min(8)` only. | Add `zxcvbn-ts` or regex; configure Better Auth. |
| Medium | `server/auth-instance.ts` | Better Auth under-configured: no email verification, no mailer, no explicit session policy, no password strength. | Enable email verification, password policy, session config; add Resend mailer. |
| Medium | `register.action.server.ts`, `token.action.server.ts` | JSON endpoints call `returnHeaders: true` but discard `Set-Cookie` headers. | Merge cookies if browser flow expected, or document bearer-only and remove overhead. |
| Medium | `db/schema.ts` | `workspace_users` and `workspace_invite` lack unique constraints. | Add unique indexes on `(user_id, workspace_id)`. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Fix forgot/reset password flow | 1 day |
| P0 | Fix `/api/me` password change | 0.5 day |
| P0 | Fix sign-out URL and cookie clearing | 0.5 day |
| P0 | Fix workspace creation confused-deputy | 0.5 day |
| P0 | Fix accept-invite action and bind invites to user | 1–2 days |
| P0 | Add strict redirect validator | 0.5 day |
| P1 | Fix `getMeProfile` and type Better Auth client | 1 day |
| P1 | Add email verification, password policy, session config | 1–2 days |
| P2 | Move rate limiting to shared store | 2–3 days |

## Cross-Cutting Concerns

- Workspace creation flows into Twilio subaccount provisioning and Stripe customer creation. Auth must be rock-solid before this.
- Email delivery is currently not wired; invite flows rely on token verification. A mailer must be added before email verification and forgot-password work.

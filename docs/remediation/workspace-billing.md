# Workspace, Members & Billing Remediation

## Summary

The workspace/members/billing slice has severe RBAC gaps in the legacy HTML settings path, broken API-key auth, credential leaks, and a Stripe double-credit path. The HTML settings action is the single largest privilege-escalation vector.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `workspaces+/$id/settings.action.server.ts` | Only calls `verifyAuth`; no `requireWorkspaceAccess` or role check. Any logged-in user can mutate any workspace. | Add `requireWorkspaceAccess` and role-gate each mutation. |
| Critical | `settings.loader.server.ts`, `settings/numbers.loader.server.ts` | Return members/numbers/webhooks to non-members. | Add membership check before data fetch; return 404. |
| Critical | `platform-members.server.ts` | `requireMemberManager` only rejects callers; allows members/admins to escalate to owner. | Only owners assign `owner`; prevent sole-owner removal. |
| High | `workspace-members-db.server.ts` | `transferWorkspaceOwnership` does not verify new owner is a member; no transaction. | Verify membership; wrap both updates in transaction. |
| High | `api-auth.server.ts` | `KEY_PREFIX = "cc_live_"` and `API_KEY_PREFIX_LENGTH = 10` means every key has the same prefix; lookup non-deterministic. | Derive prefix from random secret; add unique index. |
| Critical | `api+/workspace.action.server.ts` | Returns full workspace row with `twilio_data`, `key`, `token`, `stripe_id`. | Return only public fields; restrict updates to owner/admin. |
| Critical | `platform-billing.server.ts`, `confirm-payment.loader.server.ts`, `stripe-webhook.action.server.ts` | Webhook and redirect use different idempotency keys; redirect lacks workspace auth and payment status check. | Use single idempotency key; require membership; verify `payment_status === "paid"`. |
| High | `api+/jobs+/number-rental-billing.action.server.ts`, `billing-reconcile.action.server.ts` | Cron secret optional; billing-reconcile has no secret. | Make secret mandatory; reject missing/mismatched. |
| Medium | `platform-onboarding.server.ts` | Admin can PATCH onboarding `status` directly, bypassing state machine. | Disallow direct status writes or enforce valid transitions. |
| Medium | `WorkspaceSettingUtils.server.ts` | Webhook update bypasses `assertSafeOutboundUrl`. | Route through platform helper or add URL validation. |
| Medium | `workspace-members-db.server.ts` | `deleteWorkspaceById` only deletes workspace row; orphan tenant data. | Add transaction/RPC to delete scoped rows and revoke Twilio resources. |
| High | `workspace.server.ts` | `acceptWorkspaceInvitations` non-atomic; no unique constraints. | Add `eq(workspace_invite.user_id, userId)`; wrap in transaction; add unique indexes. |
| High | `platform-workspace-numbers.server.ts` | Number rental non-atomic (credit check → Twilio → DB debit). | Reserve/debit credits atomically or use compensating transaction. |
| Medium | `safe-outbound-url.server.ts`, `webhook.action.server.ts` | Webhook test SSRF via redirects; no workspace access check. | Use `redirect: "error"`; add `requireMemberManager`; resolve IPs. |
| Medium | `docs/stripe-webhook.md` | Still describes old trigger; out of sync with `apply_ledger_entry_and_sync_credits`. | Update docs after billing RPC migration is promoted. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Fix settings UI action + loader RBAC | 2–3 days |
| P0 | Fix member role escalation / owner removal | 1–2 days |
| P0 | Fix API-key prefix/auth | 1–2 days |
| P0 | Fix `/api/workspace` credential leak | 0.5–1 day |
| P0 | Fix Stripe double-credit | 1–2 days |
| P0 | Secure cron endpoints | 0.5–1 day |
| P1 | Fix transfer ownership + invite binding | 1 day |
| P1 | Fix onboarding status state machine | 0.5 day |
| P2 | Cascade workspace deletion | 1–2 days |
| P2 | Atomic number rental credit flow | 1 day |

## Cross-Cutting Concerns

- The HTML settings action bypasses the same API routes that are already (partially) secured. A long-term fix is to make the UI call the API routes, not legacy form handlers.
- Billing correctness depends on the `apply_ledger_entry_and_sync_credits` RPC being in the active migration path.

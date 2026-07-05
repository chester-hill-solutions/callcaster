# Telephony & Dialer Remediation

## Summary

The telephony/dialer slice has an unauthenticated predictive dialer, missing Twilio signature validation on TwiML routes, broken conference lifecycle, and inconsistent billing. The dialer queue race is the most severe new finding.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `api+/auto-dial/dialer.action.server.ts` | Trusts `user_id`, `workspace_id`, `campaign_id` from JSON body; no auth. | Add `requireJsonAuth` + `requireWorkspaceAccess`; match user_id to session. |
| Critical | `api+/call.action.server.ts`, `api+/dial/$number.action.server.ts` | Return TwiML without validating Twilio signature. | Add `validateTwilioWebhookForCallSid`/`ForWorkspace`; return hangup on failure. |
| High | `twilio-token.server.ts`, `handset-token.server.ts` | Tokens default to 24h, `incomingAllow: true`; handset token accepts arbitrary `client_identity`. | Short TTL; bind identity to session user; restrict inbound grants. |
| High | `api+/auto-dial/end.action.server.ts`, `telephony-db.server.ts` | `call.conference_id` stores friendlyName; cleanup queries by ConferenceSid; never matches. | Store actual `ConferenceSid`; update queries; add `endConferenceOnExit`. |
| High | `api+/call-status.action.server.ts`, `api+/auto-dial/status.action.server.ts` | Different billing kinds/idempotency keys for same call; debit on failed/busy/no-answer. | Single status/billing path; derive kind from campaign; debit only connected/completed. |
| High | `api+/hangup.action.server.ts` | Uses `findActiveAssignedQueueForUser(user.id)` (not call-specific) and updates all attempts by contact. | Load call by `callSid`; use call's `contact_id`/`outreach_attempt_id`. |
| Critical | `auto-dial/dialer.action.server.ts`, `auto_dial_queue` SQL | Queue assignment is racy; can double-dial same contact. | Use `SELECT ... FOR UPDATE SKIP LOCKED`; create Twilio call only after successful claim. |
| High | `api+/auto-dial.action.server.ts`, `api+/auto-dial/$roomId.action.server.ts` | Conference name is user ID and reused across calls. | Generate unique UUID conference name per session; store on call record. |
| High | `call-status`, `auto-dial/status`, `ivr/status`, `dial/$number`, `call` | Billing inconsistency: failed/no-answer billed as 1 minute; manual dial not billed; IVR vs staffed mismatch. | Reconcile terminal billing set; use absolute `statusCallback` URLs; persist workspace in call row. |
| Medium | `phone.ts`, `dial.action.server.ts`, `auto-dial/dialer.action.server.ts` | Phone normalization is North-America-only and accepts invalid numbers. | Use `libphonenumber-js`; reject emergency/short codes. |
| Medium | `workspaces+/$id/campaigns/$campaign_id/call.loader.server.ts` | Generates token before workspace access check. | Add `requireWorkspaceAccess` before token generation. |
| Medium | `api+/connect-phone-device.action.server.ts`, `api+/auto-dial.action.server.ts` | Use global `TWILIO_PHONE_NUMBER`; no caller-ID validation; `campaign_id` not parsed. | Validate against workspace numbers; parse/validate campaign_id; check credits/schedule. |
| Medium | `api+/questions.action.server.ts`, `api+/outreach-attempts.action.server.ts` | Overwrite other agents' attempts; no workspace access check. | Scope to user; add `requireWorkspaceAccess`. |
| Medium | `twilio-webhook.server.ts` | Non-production fallback to main account token for unknown calls. | Remove fallback; ensure call row exists before callbacks. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Add auth to `/api/auto-dial/dialer` | 1–2 days |
| P0 | Validate Twilio signatures on TwiML routes | 2–3 days |
| P0 | Fix predictive dialer queue race | 2–3 days |
| P0 | Fix conference cleanup (unique names + ConferenceSid) | 3–5 days |
| P1 | Unify billing and prevent double-charge | 2–3 days |
| P1 | Harden Voice SDK tokens | 2–3 days |
| P1 | Fix `/api/hangup` queue/disposition logic | 1–2 days |
| P2 | Add access checks to call-screen loader | 1 day |
| P2 | Fix connect-phone-device and auto-dial initial | 2 days |
| P2 | Improve phone validation | 1 day |
| P3 | Add adversarial tests (concurrency, billing, collision) | 2–3 days |

## Cross-Cutting Concerns

- Billing correctness depends on the data-plane and workspace slices (campaign ownership, workspace in call row).
- Conference lifecycle must be owned end-to-end: creation, participant join/leave, agent hangup, cleanup.
- Webhook URL drift (`BASE_URL`/localtunnel) breaks signature validation. Sync scripts must run after tunnel changes.

# IVR, Inbound & SMS Remediation

## Summary

The IVR/inbound/SMS slice has state injection across numbers/campaigns, ACD race conditions, SMS compliance gaps, and unsafe media/public survey endpoints. The ACD duplicate offer and IVR read-modify-write race are the most severe new findings.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| High | `api+/inbound-ivr/.../response.action.server.ts`, `api+/ivr/.../response.action.server.ts` | Validate Twilio signature but then load script by URL `numberId`/`campaignId` without checking against call. | Assert `call.to === number.phone_number` or `call.campaign_id === campaignId`. |
| High | `lib/acd/acd-router.server.ts` | Claims/dials agent on every wait-URL poll; no pending offer tracking; no queue cap. | Track `offered_at`/`offered_to_user_id`; add max wait time and offer attempts. |
| High | `api+/sms.action.server.ts`, `api+/chat_sms.action.server.ts`, `api+/ivr.action.server.ts` | `from`/`caller_id` passed to Twilio without proving workspace ownership. | Validate against `workspace_number` or messaging service. |
| High | `api+/message_media.action.server.ts` | `requireDualAuth` but no workspace access; no file validation; DELETE only removes filename, not S3 object. | Add `requireWorkspaceAccess`; validate file type/size; delete S3 object. |
| Medium-High | `api+/survey-answer.action.server.ts`, `api+/survey-complete.action.server.ts` | Public; accept client-generated `resultId`; no unique constraint. | Rate limit + CAPTCHA; server-generate `resultId`; add unique constraint. |
| High | `lib/acd/acd-router.server.ts` | `claim_inbound_queue_entry` always inserts a new offered entry; duplicate offers for same caller. | Add partial unique index on non-terminal entries per `(queue_id, call_sid)`; make idempotent. |
| High | `api+/ivr/$campaignId/$pageId/$blockId/response.action.server.ts` | Read-modify-write race on `outreach_attempt.result`; `nextStep` not validated. | Use `select ... for update` or JSON-merge RPC; validate targets. |
| High | `api+/campaign_queue.action.server.ts` | POST/DELETE lacks workspace auth; uses unscoped DB. | Resolve campaign workspace; add `requireWorkspaceAccess`; scope table. |
| Medium | `api+/email-vm.action.server.ts` | HTML email interpolates raw caller data; 100-day signed URL. | HTML-escape; reduce expiry; only set callback when action is email. |
| Medium | `twilio-webhook.server.ts`, `acd-router.server.ts` | Signature validation uses incoming request URL, not canonical URL. | Use `env.BASE_URL() + pathname`. |
| Medium | `twilio-workspace-credentials.ts` | Non-production fallback to main account token. | Remove fallback; use dedicated override flag. |
| Medium | `api+/initiate-ivr.action.server.ts` | Internal fetch to `/api/ivr` without credentials; endpoint trusts caller_id. | Refactor to shared function; validate caller_id; add workspace access. |
| Medium | `lib/acd/acd-router.server.ts` | `handleComplete` skips validation when `workspaceId` unresolved; `entry_id=0` placeholder. | Always require signature; look up entry by `CallSid` + queue. |
| Medium | `api+/inbound.action.server.ts` | Writes call status as `completed` on first webhook. | Use `CallStatus` and real `start_time`/`duration`. |
| Medium | `api+/sms.action.server.ts` | Ignores `contact.opt_out` in batch dispatch. | Filter opted-out contacts before sending. |
| Medium | `api+/inbound-sms.action.server.ts` | Opt-out applied before message insert; matching too narrow. | Insert message first; normalize body; handle `STOP ALL`/`UNSTOP`/`HELP`. |
| Medium | `api+/sms.action.server.ts` | Duplicate check non-atomic; double-dequeue; fallback SID collision. | Atomic duplicate guard; UUID fallback SID; create outreach before Twilio send. |
| Low-Medium | `api+/ivr/.../response.action.server.ts` | DTMF input stored unsanitized; raw error leaked in `<Say>`. | Sanitize input; hide error details from TwiML. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Bind IVR URL params to call record | 1–2 days |
| P0 | Lock ACD agent offers and cap queue time | 2–3 days |
| P0 | Validate owned `caller_id` for SMS/voice | 2 days |
| P1 | Enforce workspace auth on media upload | 1 day |
| P1 | Authenticate + rate-limit public surveys | 2–3 days |
| P1 | Fix ACD duplicate offers | 1 day |
| P1 | Fix IVR response race + next-step validation | 1–2 days |
| P1 | Fix `campaign_queue` auth and scoping | 2 days |
| P1 | Use canonical URL for webhook validation | 1 day |
| P2 | Fix initiate-IVR internal call | 1 day |
| P2 | Fix ACD complete edge cases | 1 day |
| P2 | Respect SMS opt-outs + improve STOP handling | 1 day |
| P3 | Add SMS concurrency tests | 1–2 days |

## Cross-Cutting Concerns

- IVR state is stored in `outreach_attempt.result`, which is shared with the data-plane survey path. Fix the race there.
- SMS compliance (TCPA/10DLC) intersects with billing and data-plane contact management.
- ACD and inbound queue are tightly coupled with agent status and workspace real-time events.

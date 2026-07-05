# Data Plane Remediation

## Summary

The data plane (contacts, audiences, campaigns, scripts, surveys) has missing workspace authorization on most legacy routes, unscoped join tables, and unsafe public survey endpoints. The `campaign_queue`/`contact_audience`/`campaign_audience` tables are not tenant-scoped, which is the largest structural gap.

## Detailed Findings

| Severity | Location | Problem | Remediation |
|---|---|---|---|
| Critical | `api+/campaigns.action.server.ts`, `api+/scripts.action.server.ts`, `api+/contacts.action.server.ts`, `api+/audiences.action.server.ts`, `api+/audience-upload.action.server.ts`, `api+/campaign_queue.action.server.ts`, `api+/reset_campaign.action.server.ts`, etc. | `requireDualAuth` only proves identity; no workspace membership check. | Add `requireWorkspaceAccess` or use `withWorkspaceApiAction` wrappers; return 404. |
| Critical | `api+/audiences.loader.server.ts` | JSON path returns `contact_audience` rows without workspace filter. | Resolve audience workspace; add `contact.workspace` filter. |
| Critical | `api+/campaign_queue.action.server.ts` | Enqueue/delete by `campaign_id` only; `campaign_queue` not workspace-scoped. | Resolve campaign workspace; validate contacts; add unique constraint or scope column. |
| Critical | `api+/audience-upload.action.server.ts` | Creates new audience in arbitrary workspace when `audience_name` provided. | Add `requireWorkspaceAccess`; reject unauthorized uploads. |
| Critical | `api+/contacts.action.server.ts` | PATCH/POST trust `workspace_id` and `audience_id` from body. | Validate membership; verify audience belongs to workspace. |
| High | `api+/reset_campaign.action.server.ts`, `db-rpc.server.ts` | Deletes `outreach_attempt` permanently; only flips `status`, leaving `dequeued_at`, `assigned_to_user_id`, etc. stale. | Add workspace auth; reset all queue lifecycle fields; archive or rename. |
| High | `audience-upload-process.server.ts` | No phone deduplication, no row limits, no transaction safety. | Normalize + dedupe; add unique index; wrap in transaction; enforce limits. |
| High | `api+/contact-audience.action.server.ts`, `bulk-delete.action.server.ts` | No workspace membership check. | Add `requireWorkspaceAccess`; use scoped DB. |
| Critical | `workspace-scoped-tables.ts`, `schema.ts`, `campaign-queue-db.server.ts`, `campaign-audience-db.server.ts`, `contact-audience.server.ts` | `campaign_queue`, `campaign_audience`, `contact_audience` not in scoped registry; no FK constraints. | Add `workspace_id` columns and FKs; register in scoped tables; add cascade deletes. |
| High | `schema.ts`, `survey-db.server.ts`, `survey-answer.action.server.ts`, `survey-complete.action.server.ts` | Survey child tables unscoped; public endpoints accept internal numeric `surveyId` and arbitrary `resultId`. | Add workspace to child tables; use public UUID; validate `resultId` as session token; hide internal id. |
| High | `audience-upload.action.server.ts`, `audience-upload-process.server.ts`, `csv.ts`, `phone.ts` | Upload not idempotent, not locked, does not normalize phones. | Use job queue; add lock/idempotency; normalize phones; validate base64. |
| Medium-High | `api+/scripts.action.server.ts`, `create-with-script.server.ts`, `campaign-ivr.server.ts` | Script validation only JSON-shape; no semantic validation of page/block/audio/phone refs. | Validate script steps; check refs; ensure campaign type compatibility. |
| Medium | `api+/survey-responses.action.server.ts` | Requires auth but does not check workspace membership. | Resolve survey workspace; add `requireWorkspaceAccess`. |
| Medium | `survey-db.server.ts` | Questions looked up by public UUID without verifying they belong to the survey. | Join/verify `survey_question.page_id -> survey_page.survey_id`; validate options. |
| Medium | `schema.ts` | No unique constraint on phone per workspace, audience/script name, or `(campaign_id, contact_id)`. | Add unique constraints. |
| Medium | `audience-upload-db.server.ts` | Audience deletion leaves orphan contacts. | Decide cleanup policy: cascade or "unassigned". |
| Low | `csv.ts`, `audience-upload-process.server.ts` | Imported raw values stored; could be dangerous if rendered elsewhere. | Escape when rendering; ensure all exports use `protectFromInjection`. |

## Remediation Plan

| Priority | Item | Effort |
|---|---|---|
| P0 | Add `requireWorkspaceAccess` to every mutating data-plane route | 2–3 days |
| P0 | Fix `/api/audiences` JSON loader | 0.5 day |
| P0 | Fix `/api/campaign_queue` authorization and scoping | 2 days |
| P0 | Fix `/api/audience-upload` authorization | 0.5 day |
| P0 | Add workspace columns + FKs to `campaign_queue`, `campaign_audience`, `contact_audience` | 2 days |
| P1 | Rewrite `reset_campaign` RPC + route | 1 day |
| P1 | Audience upload deduplication, limits, transactional safety | 2–3 days |
| P1 | Add DB unique constraints | 1 day |
| P2 | Scope survey child tables and harden public endpoints | 2–3 days |
| P2 | Add script semantic validation | 1–2 days |
| P3 | Decide audience-delete contact behavior | 0.5 day |

## Cross-Cutting Concerns

- The data-plane routes are the foundation for telephony and billing. Unscoped `campaign_queue` directly affects dialer correctness.
- Survey data integrity depends on the same scoping fixes as contacts/audiences.
- CSV upload processing must move to the worker to be reliable.

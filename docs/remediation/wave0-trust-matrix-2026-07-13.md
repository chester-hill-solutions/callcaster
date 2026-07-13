# Wave 0 — Trust / Boundary Matrix

**Generated:** 2026-07-13  
**Branch:** `chore/effects-strictness` @ `5e8716a6`

| Ticket | Route(s) | Handler module(s) | Caller identity | Auth mechanism (current) | Tenant derivation (current) | In-repo consumers | Compatibility decision |
|---|---|---|---|---|---|---|---|
| **SEC-01** | `POST /api/workspace` | `app/routes/api+/workspace.action.server.ts` | Intended: workspace admin / integrator | `requireDualAuth` (API keys rejected in practice) | Body `workspace_id`; any member role | Tests/docs only — no runtime callers | **Hard-cut** — delete; finish `GET/PATCH /api/workspaces/:workspaceId` |
| **SEC-02** | `POST /api/auto-dial/dialer` | `app/routes/api+/auto-dial/dialer.action.server.ts` | Anyone with URL | **None** | Body-supplied IDs | In-process only via signed Twilio routes | **Hard-cut** — replace with workspace-scoped dialer start |
| **SEC-02** | `POST /api/auto-dial/end` | `app/routes/api+/auto-dial/end.action.server.ts` | Authenticated agent | `resolveJsonAuthSession` | Body `workspaceId`; no membership check | `app/lib/callscreenActions.ts` | **Secure in place** — add membership + ownership |
| **SEC-02** | `POST /api/auto-dial` | `app/routes/api+/auto-dial.action.server.ts` | Browser agent | Session + `requireWorkspaceAccess` | Body `workspace_id` | `hooks-api.ts`, `useStartConferenceAndDial.ts` | **Hard-cut** with dialer migration |
| **SEC-05** | `POST /api/disconnect` | `app/routes/api.disconnect.action.server.ts` | Legacy / unknown | **None** | Body `CallSid` only | Tests/e2e mocks only; UI uses `/api/hangup` | **Hard-cut** — workspace-scoped disconnect |
| **SEC-06** | `POST /api/inbound-verification` | `app/routes/api+/inbound-verification.action.server.ts` | Twilio Voice | **None** — no signature | Twilio `From` → pending session | Verification scripts, paired session mint route | **Secure in place** — add Twilio signature |
| **SEC-03** | `GET/POST /accept-invite` | `accept-invite.*.server.ts` | Invitee | Session + optional email verify | Invite IDs only — no email binding | Invite UI, admin invite routes, e2e | **Secure in place** — email-bound tokens + CAS |
| **SURVEY-01** | `GET /survey/:surveyId` | `survey+/$surveyId.loader.server.ts` | Anonymous respondent | **None** | Public survey ID | Public survey UI | **Secure in place** or disable until fixed |
| **SURVEY-01** | `POST /api/survey-answer`, `/api/survey-complete` | survey-answer/complete actions | Public respondent | Rate limit + honeypot | Client-supplied IDs | Public survey UI | **Secure in place** |
| **DATA-01** | Workspace queue UI POST | `workspaces+/…/queue.action.server.ts` | Workspace member | Layout middleware | **`params.selected_id` only** — context unused | Queue route UI | **Secure in place** — mandatory workspace in helpers |
| **DATA-01** | `POST/DELETE /api/campaign_queue` | `api+/campaign_queue.action.server.ts` | Session/API key | `requireDualAuth` + workspace | Campaign lookup; DELETE batches unscoped | Queue UI handlers | **Secure in place** |
| **DATA-01** | `PATCH /api/campaigns/:campaignId/queue` | `campaigns/$campaignId/queue.action.server.ts` | Integrator | `authForCampaign` | Route workspace; helpers optional scope | Messaging client | **Secure in place** |
| **DATA-01** | `POST /api/campaign_audience` | `api+/campaign_audience.action.server.ts` | Session/API key | Dual auth only | Shared-workspace ID check | Queue UI | **Secure in place** — add access gate |
| **SEC-04** | Stored webhook delivery | `app/lib/workspace-webhooks.server.ts` | Internal server | N/A | `workspaceId` arg | SMS/inbound/email-vm routes | **Disable or secure Wave 1** — route through `safeOutboundFetch` |

## Wave 0 notes

1. **SEC-01** has zero runtime consumers — safe to delete once scoped PATCH covers settings.
2. **SEC-02 dialer HTTP** is the highest-severity open boundary; Twilio callbacks already call `runAutoDialerTurn` in-process with signatures.
3. **SEC-05** appears dead in production UI paths.
4. **DATA-01** worst surface: workspace UI queue action authenticates but DB helpers are ID-only.
5. **SEC-04** splits: config/test uses `safeOutboundFetch`; event fanout uses raw `fetch`.

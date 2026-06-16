# IVR: Remix routes vs Supabase Edge (audit)

> Audit only — no deletions until product confirms callers. Last updated: 2026-05-27.

## Runtime classification (code audit, 2026-05-27)

| Component | Status | Notes |
| --- | --- | --- |
| `initiateIvrCall` → `/api/ivr/...` | **Active (Remix)** | Primary app-initiated outbound IVR |
| `ivr-handler` → `/ivr-flow` | **Active (Edge)** | Queue-driven outbound IVR |
| Remix `api+/ivr/*` TwiML tree | **Active (Remix)** | Used when calls hit Remix flow URL |
| Edge `ivr-flow` / `ivr-status` / `ivr-recording` | **Active (Edge)** | Used when calls hit Edge flow URL |
| `api+/ivr/.../blockId` (no signature) | **Fixed** | Signature validation added per structural improvements plan |

**Production traffic split:** unknown until live audit — use admin `auditWorkspaceTwilioWebhooks` or `scripts/audit-twilio-webhooks.mjs`. See [`docs/twilio-callback-map.md`](twilio-callback-map.md).

## IVR runtime decision (interim, 2026-05-27)

| Decision | Value |
| --- | --- |
| Live traffic | **Pending** admin/script audit per workspace |
| Default for new calls | **Remix** (`initiateIvrCall` unchanged unless `TWILIO_IVR_RUNTIME=edge`) |
| Edge path | Available via `ivr-handler` queue and `TWILIO_IVR_RUNTIME=edge` |
| Deprecation | Do not remove Remix `api+/ivr/*` or Edge `ivr-flow` until audit shows zero callers |

Set `TWILIO_IVR_RUNTIME=edge` in environment to migrate new IVR initiation to Edge callbacks without deleting Remix routes.

Related docs: [`twilio-runtime-inventory.md`](twilio-runtime-inventory.md), [`twilio-canonical-callback-map.md`](twilio-canonical-callback-map.md).

## Remix / app routes (current)

| Path | Module | Role |
|------|--------|------|
| `POST /api/initiate-ivr` | `app/routes/api+/initiate-ivr/route.tsx` | Starts outbound IVR via `initiateIvrCall` (`app/lib/ivr-initiate.server.ts`) |
| `POST /api/ivr/:campaignId` | `app/routes/api+/ivr/route.tsx` | IVR flow entry (TwiML) |
| `POST /api/ivr/:campaignId/:pageId` | `app/routes/api+/ivr/$campaignId/$pageId/route.tsx` | Page transitions |
| `POST /api/ivr/.../response` | `app/routes/api+/ivr/$campaignId/$pageId/$blockId/response/route.tsx` | Block responses |
| `POST /api/ivr/status` | `app/routes/api+/ivr/status/route.tsx` | Status callbacks (app) |

## Edge functions (Supabase)

| Function | Caller | JWT |
|----------|--------|-----|
| `ivr-flow` | Twilio (TwiML) | `verify_jwt = false` (Twilio signature) |
| `ivr-status` | Twilio status | `verify_jwt = false` |
| `ivr-recording` | Twilio recording | `verify_jwt = false` |

## Overlap / risk

- **Initiation** is app-only (`ivr-initiate.server.ts`); Edge does not duplicate dial-out.
- **In-call flow** may be served by Edge (`ivr-flow`) while legacy Remix `api+/ivr/*` trees still exist — confirm Twilio Voice URL / status URL on each campaign before removing Remix handlers.
- **Queue dequeue** uses `buildDequeuedQueueUpdate` in both app and Edge paths; keep semantics aligned with `queue-status` helpers.

## Recommended next steps (manual)

1. For each active IVR campaign, record Twilio webhook URLs (initiate, flow, status, recording).
2. If all traffic hits Edge, mark Remix `api+/ivr/*` as deprecated behind a feature flag, then delete in a follow-up PR.
3. Add integration tests that assert `initiateIvrCall` RPC + Twilio create call arguments (see `test/ivr-initiate.server.test.ts`).

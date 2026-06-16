# Twilio canonical callback map (expected targets)

> Defines **expected** callback URLs per resource type. IVR flow runtime (Remix vs Edge) remains **pending audit** — both candidate columns are listed until `phase3-05-decide-ivr-runtime` completes.

## URL bases

| Base | Pattern | Used for |
| --- | --- | --- |
| App | `${BASE_URL}/api/...` | Voice TwiML, inbound voice/SMS, Remix status callbacks |
| Edge | `${SUPABASE_URL}/functions/v1/...` | SMS status, Edge IVR flow/status/recording |

## Expected targets by resource type

| Resource / event | Expected handler | URL | Notes |
| --- | --- | --- | --- |
| Inbound voice (number) | Remix | `${BASE_URL}/api/inbound` | Set on number purchase `voiceUrl` |
| Inbound SMS (number) | Remix | `${BASE_URL}/api/inbound-sms` | Set on number purchase `smsUrl` |
| Number status / caller ID | Remix | `${BASE_URL}/api/caller-id/status` | Number `statusCallback` |
| Outbound SMS status | Edge | `${SUPABASE_URL}/functions/v1/sms-status` | **Canonical** for new sends |
| Outbound SMS status (legacy) | Remix | `${BASE_URL}/api/sms/status` | Compatibility shim; deprecate when unused |
| Outbound call status (agent dial) | Remix | `${BASE_URL}/api/call-status/` | |
| Dial bridge status | Remix | `${BASE_URL}/api/dial/status` | |
| Auto-dial status | Remix | `${BASE_URL}/api/auto-dial/status` | |
| Conference connect TwiML | Remix | `${BASE_URL}/api/connect-campaign-conference/:workspaceId/:campaignId` | Twilio signature required (workspace subaccount token) |
| IVR TwiML flow (Remix candidate) | Remix | `${BASE_URL}/api/ivr/:campaignId/...` | Used by `initiateIvrCall` today |
| IVR status (Remix candidate) | Remix | `${BASE_URL}/api/ivr/status` | Used by `initiateIvrCall` today |
| IVR TwiML flow (Edge candidate) | Edge | `${SUPABASE_URL}/functions/v1/ivr-flow` | Used by `ivr-handler` |
| IVR status (Edge candidate) | Edge | `${SUPABASE_URL}/functions/v1/ivr-status` | Used by `ivr-flow` / `ivr-handler` |
| IVR recording | Edge | `${SUPABASE_URL}/functions/v1/ivr-recording` | Edge path |
| Handset inbound | Remix | `${BASE_URL}/api/inbound-handset` | |
| Verification inbound | Remix | `${BASE_URL}/api/inbound-verification` | Dev script only |

## Messaging Service inbound strategy

**Current product choice:** number-level inbound (`voiceUrl` / `smsUrl` on each purchased number). Messaging Service is used for **outbound** sender pool and compliance, not MS-level inbound webhooks.

Bootstrap should configure MS sender behavior (sticky sender, geomatch) via API; inbound remains on numbers unless product changes.

## Consolidation status (updated by audit tooling)

| Area | Status |
| --- | --- |
| SMS status | Canonical = Edge; Remix = legacy shim |
| IVR runtime | **Pending audit** — see `docs/twilio-callback-map.md` and `docs/ivr-remix-vs-edge-audit.md` |
| Inbound voice/SMS | Canonical = Remix number webhooks |

# Twilio callback map artifact

> Per-source callback construction, validation, and consolidation status. Last updated: 2026-05-27.

| Source file | Constructed URL | Target | Validates signature | Base | Consolidation |
| --- | --- | --- | --- | --- | --- |
| `numbers.action.server.ts` | `${BASE_URL}/api/inbound` | Remix inbound voice | Yes | App | Canonical |
| `numbers.action.server.ts` | `${BASE_URL}/api/inbound-sms` | Remix inbound SMS | Yes | App | Canonical |
| `numbers.action.server.ts` | `${BASE_URL}/api/caller-id/status` | Remix caller-id status | Yes | App | Canonical |
| `chat-sms.server.ts` | `${SUPABASE_URL}/functions/v1/sms-status` | Edge sms-status | Yes | Edge | Canonical |
| `sms.action.server.ts` | `${SUPABASE_URL}/functions/v1/sms-status` | Edge sms-status | Yes | Edge | Canonical |
| `sms-handler/index.ts` | `${functionsBaseUrl}sms-status` | Edge sms-status | Yes | Edge | Canonical |
| `ivr-initiate.server.ts` | `${BASE_URL}/api/ivr/:id/page_1/` | Remix IVR page | Yes | App | Active (Remix path) |
| `ivr-initiate.server.ts` | `${BASE_URL}/api/ivr/status` | Remix IVR status | Yes | App | Active (Remix path) |
| `ivr.action.server.ts` | `${BASE_URL}/api/ivr/status` | Remix IVR status | Yes | App | Active (Remix path) |
| `ivr-handler/index.ts` | `${baseUrl}/ivr-flow` | Edge ivr-flow | Yes | Edge | Active (Edge path) |
| `ivr-handler/index.ts` | `${baseUrl}/ivr-status` | Edge ivr-status | Yes | Edge | Active (Edge path) |
| `ivr-flow/index.ts` | `${baseUrl}/ivr-flow` | Edge ivr-flow (self) | Yes | Edge | Active (Edge path) |
| `ivr-flow/index.ts` | `${baseUrl}/ivr-status` | Edge ivr-status | Yes | Edge | Active (Edge path) |
| `ivr-recording/index.ts` | redirects to `/ivr-flow` | Edge ivr-flow | Yes | Edge | Active (Edge path) |
| `ivr/.../blockId.action.server.ts` | (TwiML redirects to Remix IVR URLs) | Remix IVR block | Yes (after fix) | App | Active (Remix path) |
| `call.action.server.ts` | `${BASE_URL}/api/call-status/` | Remix call status | Partial | App | Classify before change |
| `dial/$number.action.server.ts` | `/api/call-status/` | Remix call status | Yes | App | Canonical |
| `auto-dial.server.ts` | `${BASE_URL}/api/auto-dial/status` | Remix auto-dial status | Yes | App | Canonical |
| `auto-dial/$roomId.action.server.ts` | `${BASE_URL}/api/auto-dial/status` | Remix auto-dial status | Yes | App | Canonical |
| `caller-id-verification.server.ts` | `${BASE_URL}/api/caller-id/status` | Remix caller-id status | Yes | App | Canonical |
| Legacy sends (unknown) | `${BASE_URL}/api/sms/status` | Remix sms/status | Yes | App | Legacy shim |

## IVR runtime classification (code-level)

| Initiation path | Flow URL | Status URL | Classification |
| --- | --- | --- | --- |
| `initiateIvrCall` (app) | Remix `/api/ivr/...` | Remix `/api/ivr/status` | **Remix-active** |
| `ivr-handler` (Edge queue) | Edge `/ivr-flow` | Edge `/ivr-status` | **Edge-active** |

Live production classification requires `auditWorkspaceTwilioWebhooks` (admin tool) — see `app/lib/twilio-webhook-audit.server.ts`.

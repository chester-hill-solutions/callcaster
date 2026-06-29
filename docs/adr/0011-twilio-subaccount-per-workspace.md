# Twilio subaccount-per-workspace

Each workspace gets its own Twilio subaccount with its own auth token, stored in the normalized `workspace_twilio_config` table (v2 replaces the `twilio_data` JSONB blob). Webhook signatures validated per-workspace using the subaccount auth token, not the main account token. Dev/test fallback to main account token (`TWILIO_AUTH_TOKEN`) in non-production. Production fail-closed: missing workspace credentials yield no auth token; webhook validation fails. CallSid vs MessageSid asymmetry: CallSid webhooks may validate against main account token in non-production when no `call` row exists yet; MessageSid webhooks fail closed when no `message` row exists (inbound SMS must attribute workspace before persisting). API keys (`workspace.key`/`workspace.token`) are used for Twilio REST calls and Voice SDK token minting; auth token is used for webhook signature validation only.

## References

- `app/lib/twilio-workspace-credentials.ts:14`, `app/lib/twilio-webhook.server.ts:192,260,298`, `docs/twilio-webhook-auth.md`, `app/twilio.server.ts`
- `docs/twilio-credential-hardening-backlog.md` (deferred work: prefer API keys for REST, minimize auth token persistence, admin rotation with audit trail)

# Twilio specials into Bun; acd-router tick to worker

All Twilio-webhook Edge functions (sms-status, ivr-status, ivr-recording, ivr-flow, acd-router) fold into Bun as a distinct route subtree with signature-only auth (never touching session auth). acd-router's self-chaining tick logic becomes a worker job via HTTP wake on `inbound_queue_entry` insert. Completes the IVR-consolidation the audit doc calls for — one IVR runtime, one auth model, one place to debug. Also consolidates: `sms-handler` (inbound SMS — app already has `api+/inbound-sms.action.server.ts`), `ivr-handler` (outbound IVR initiation — app already has `api+/initiate-ivr/route.tsx`), `workspace-twilio-sync` (→ worker job), `invite-user-by-email` (→ Better Auth invitation system), `dequeue_contacts`/`process_ivr` (legacy, removed with `user.activity` drop), `call-server` (dead stub, removed). The `TWILIO_IVR_RUNTIME` env var (`twilio-ivr-runtime.server.ts`) was an existing strangler-fig switch — proven pattern, now permanent (all traffic goes to Bun). The Twilio callback map (`docs/twilio-canonical-callback-map.md`) is the migration checklist: every Edge URL repoints to Bun, `SUPABASE_URL` env var disappears. Only 1 new route needed (`/api/ivr/recording`); 3 already exist as Remix routes. The `check-twilio-webhook-coverage.mjs` CI script stays (route paths unchanged, only runtime changes).

## Considered Options

- **Separate Node process for Twilio specials** — premature; worker already offloads long-run so Bun stays responsive.
- **Separate non-Node runtime for Twilio** — reintroduces dual-runtime duplication.

## References

- `supabase/config.toml:152-170` (Edge functions with `verify_jwt = false`), `app/lib/twilio-webhook.server.ts` (existing signature validation), `docs/ivr-remix-vs-edge-audit.md`, `docs/twilio-canonical-callback-map.md`, `docs/twilio-runtime-inventory.md`
- `app/routes/api+/inbound-sms.action.server.ts` (existing app-side inbound SMS), `app/routes/api+/initiate-ivr/route.tsx` (existing app-side IVR initiation), `app/lib/twilio-ivr-runtime.server.ts` (existing strangler-fig switch)

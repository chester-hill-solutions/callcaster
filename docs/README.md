# Documentation Index

This directory contains project documentation and archived implementation notes.

## Architecture Decision Records (ADRs)

ADRs live in [`adr/`](adr/) and document hard-to-reverse, surprising, trade-off-driven decisions. See [`CONTEXT.md`](../CONTEXT.md) at the repo root for the domain glossary.

### v2 Infrastructure (ADR-0001–0010)

- [0001 — Bun as the single runtime](adr/0001-bun-as-single-runtime.md)
- [0002 — Shed Supabase-the-product, keep Postgres on Railway](adr/0002-shed-supabase-keep-postgres-on-railway.md)
- [0003 — Drizzle + postgres, hybrid with plpgsql RPCs](adr/0003-drizzle-hybrid-with-plpgsql-rpcs.md)
- [0004 — Scoped Drizzle client, no RLS](adr/0004-scoped-drizzle-client-no-rls.md)
- [0005 — pg-realtime: SSE + workspace_events + LISTEN/NOTIFY](adr/0005-pg-realtime-sse-workspace-events-listen-notify.md)
- [0006 — No DB-side behavior logic](adr/0006-no-db-side-behavior-logic.md)
- [0007 — Generalized job table + Bun worker](adr/0007-generalized-job-table-and-bun-worker.md)
- [0008 — Clean rebuild in callcaster-v2, one-shot cutover](adr/0008-clean-rebuild-and-cutover.md)
- [0009 — Twilio specials into Bun](adr/0009-twilio-specials-into-bun.md)
- [0010 — Better Auth one-shot migration](adr/0010-better-auth-one-shot-migration.md)

### Existing decisions formalized (ADR-0011–0018)

- [0011 — Twilio subaccount-per-workspace](adr/0011-twilio-subaccount-per-workspace.md)
- [0012 — Conference-per-call bridging](adr/0012-conference-per-call-bridging.md)
- [0013 — Roll-your-own ACD, not TaskRouter](adr/0013-roll-your-own-acd-not-taskrouter.md)
- [0014 — Doc-first OpenAPI](adr/0014-doc-first-openapi.md)
- [0015 — Domain IDs as PK, SIDs as correlation](adr/0015-domain-ids-as-pk.md)
- [0016 — Per-workspace Voice SDK tokens](adr/0016-per-workspace-voice-sdk-tokens.md)
- [0017 — Per-workspace throughput config](adr/0017-per-workspace-throughput-config.md)
- [0018 — Public API as platform boundary](adr/0018-public-api-as-platform-boundary.md)

### Domain-driven from political science (ADR-0019–0023)

- [0019 — 1-5 support scale as typed disposition](adr/0019-support-scale-as-typed-disposition.md)
- [0020 — Three-phase campaign model (ID/Persuasion/GOTV)](adr/0020-three-phase-campaign-model.md)
- [0021 — Household as first-class domain entity](adr/0021-household-as-domain-entity.md)
- [0022 — Typed voter contact results](adr/0022-typed-voter-contact-results.md)
- [0023 — Voter list lifecycle](adr/0023-voter-list-lifecycle.md)

### Architecture (ADR-0024–0026)

- [0024 — Browser-based softphone via Twilio Voice SDK](adr/0024-browser-softphone-via-twilio-voice-sdk.md)
- [0025 — Dual dial modes (manual + predictive)](adr/0025-dual-dial-modes.md)
- [0026 — Calling-only scope boundary](adr/0026-calling-only-scope-boundary.md)

### Live transcription + coaching (ADR-0027–0030)

- [0027 — Live transcription via unidirectional Media Streams + Deepgram Nova-3](adr/0027-live-transcription-unidirectional-media-streams-deepgram.md)
- [0028 — Live coaching via rule-based metrics + Cohere Command A](adr/0028-live-coaching-rule-based-metrics-cohere-command-a.md)
- [0029 — Post-call golden transcript via Cohere Transcribe batch](adr/0029-post-call-golden-transcript-cohere-batch-worker.md)
- [0030 — Media-stream Bun service as third Railway process](adr/0030-media-stream-bun-service-third-railway-process.md)

## Active docs

- `design-system.md`
- `design-system-audit.md`
- `local-development.md`
- `testing-map.md`
- `e2e-testing.md`
- `error-handling.md`
- `stripe-webhook.md`
- `number-rental-billing.md`
- `api-overview.md` — Public integrator API boundary, quickstart, auth, errors, SDK
- `api-auth-matrix.md` — Auth modes for all callable API routes
- `api-surface-inventory.md` — Generated complete route inventory (run `npm run tools:api:surface:report`)
- `api-workspace-admin.md` — Workspace, API keys, numbers, agent status
- `api-data-management.md` — Contacts, audiences, scripts, campaigns
- `api-analytics-export.md` — Exports and status polling
- `api-telephony-control.md` — Dialer, IVR, auto-dial, call screen session APIs
- `api-webhooks.md` — Twilio and Stripe callback map
- `api-internal-unsupported.md` — Internal trusted routes and security gaps
- `api-create-campaign-with-script.md` — `POST /api/campaigns/create-with-script` one-shot campaign setup
- `api-send-sms.md` — `POST /api/chat_sms` and `POST /api/sms` messaging endpoints
- `public-api-test-drift.md` — Public API test/coverage drift tracker
- `script-structure.md`
- `script-json-format.md`
- `csv-export-contract.md`
- `queue-status-normalization-rollout.md`
- `dryness-review-2026-06.md` — Thermo-nuclear DRYness audit of `app/` runtime (findings + remediation plan)
- `live-transcription-coaching-plan.md` — Live transcription (Deepgram) + live coaching (Cohere Command A) + post-call golden transcript (Cohere batch) implementation plan for v2
- `CHANGELOG.md`

## Archive

Historical root-level planning/checklist/report docs were moved into:

- `archive/root-notes/hooks/`
- `archive/root-notes/typescript/`
- `archive/root-notes/components/`
- `archive/root-notes/routes/`
- `archive/root-notes/general/`

These are retained for reference and are not considered current source-of-truth docs.

Deprecated Twilio Serverless scripts were moved into:

- `../archive/deprecated/twilio-serverless/`

## Legacy root files

Non-document root backups/legacy files were moved into:

- `../archive/root-legacy/`

Dev-only websocket TLS assets/script were moved into:

- `../scripts/dev/websocket-server.js`
- `../scripts/dev/certs/`

See `../archive/README.md` for archive structure details.

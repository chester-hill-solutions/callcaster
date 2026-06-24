# Documentation Index

This directory contains project documentation and archived implementation notes.

## Active docs

- `design-system.md`
- `design-system-audit.md`
- `local-development.md`
- `testing-map.md`
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

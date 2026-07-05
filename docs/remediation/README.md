# CallCaster Remediation Docs

Engineering-facing remediation plan from the antagonistic vertical-slice review.

## Status

- [ ] Phase 0 — Schema/migration drift
- [ ] Phase 1 — Workspace auth + RBAC
- [ ] Phase 2 — Telephony concurrency + billing
- [ ] Phase 3 — Worker/cron/media-stream/SSE
- [ ] Phase 4 — Public API, webhooks, observability

## Docs

- [Decisions](./decisions.md) — Architecture decisions captured during the grilling session.
- [Bring It All Together](./bring-it-all-together.md) — Cross-cutting themes and master priority order.
- [Auth & Identity](./auth-identity.md)
- [Workspace, Members & Billing](./workspace-billing.md)
- [Telephony & Dialer](./telephony-dialer.md)
- [IVR, Inbound & SMS](./ivr-inbound-sms.md)
- [Data Plane](./data-plane.md)
- [Public API & Webhooks](./public-api-webhooks.md)
- [Infrastructure, Admin & Background Jobs](./infrastructure-admin.md)

## How to use this

1. Read [Decisions](./decisions.md) and [Bring It All Together](./bring-it-all-together.md) first.
2. Pick a phase and slice.
3. Each slice doc has a prioritized remediation table with estimated effort.
4. Update the status table above as work completes.

## Notes

- Severities are relative to production cutover risk.
- All findings are sourced from the current codebase at `/Users/ladmin/WebProjects/callcaster`.
- First-pass findings were validated and expanded with a second antagonistic pass focused on concurrency, schema drift, and deployment readiness.

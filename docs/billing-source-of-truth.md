# Billing Source of Truth

**Status:** Production (Option B hard cut, June 2026)

## Rate card

Canonical constants live in [`shared/pricing.ts`](../shared/pricing.ts):

| Product | Credits | CAD (at $0.02/credit) |
|---------|--------:|----------------------:|
| Credit purchase minimum | 500 | $10.00 |
| SMS segment | 1 | $0.02 |
| MMS | 2 | $0.04 |
| IVR / auto-dial (first minute) | 2 | $0.04 |
| IVR / auto-dial (each additional minute) | 3 | $0.06 |
| Staffed live (first minute) | 4 | $0.08 |
| Staffed live (each additional minute) | 5 | $0.10 |
| Phone number rental (monthly) | 100 | $2.00 |

**Hard cut:** no grandfathering. Existing credit balances stay at face value; new purchases use the $0.02 peg.

## Ledger

All billable events write to `transaction_history` via `insertTransactionHistoryIdempotent`:

| Event | Idempotency key | Amount |
|-------|-----------------|--------|
| SMS terminal status | `sms:<MessageSid>` | `-1` credit per segment (today: 1 segment assumed) |
| Voice terminal status | `call:<CallSid>` | Campaign-type aware dial + minute formula |
| Number purchase | `number_rent_purchase:<workspaceId>:<numberSid>` | `-100` credits |
| Number monthly renewal | `number_rent:<workspaceNumberId>:<yyyy-mm>` | `-100` credits |
| Stripe checkout | `stripe_evt:<eventId>` or `stripe_session:<sessionId>` | positive credits |

The `transaction_history_update_credits` trigger updates `workspace.credits` on insert.

## Reconciliation

Nightly job: Edge function [`twilio-billing-reconcile`](../supabase/functions/twilio-billing-reconcile/index.ts) (pg_cron `twilio_billing_reconcile_daily`, 04:30 UTC).

Compares per workspace (last 30 days):

1. **Twilio Usage Records** — outbound SMS segments, outbound voice minutes, phone-number months
2. **`transaction_history` debits** — grouped by idempotency key prefix
3. **Entity audit** — terminal `message` / `call` rows vs matching ledger debits

Admin variance report: workspace Twilio ops portal → **Billing Reconciliation** panel.

Shared logic: [`shared/billing-reconciliation.ts`](../shared/billing-reconciliation.ts).

## Launch blockers vs non-blockers

| Blocker | Notes |
|---------|-------|
| Ledger writes on all billable paths | SMS, voice (incl. IVR Remix shim), number rental |
| Credits trigger in production | Captured in migration `202606100001_*` |
| pg_cron: `twilio-open-sync`, `number-rental-billing`, `twilio-billing-reconcile` | Requires `app.settings.*` GUCs |
| `NUMBER_RENTAL_CRON_SECRET` | Must be set for number-rental-billing auth |

| Non-blocker (post-launch OK) | Notes |
|------------------------------|-------|
| Multi-segment SMS debits | Option B expects per-segment; Twilio `NumSegments` not wired yet |
| Campaign cost estimates (#960) | UI transparency, not billing correctness |
| Public pricing page alignment | In-app billing updated; marketing page may lag |
| MMS distinct pricing in webhooks | Constants exist; MMS path may still debit 1 credit |

## Customer-facing surfaces

- **Billing page** — balance, purchase, Credit Usage Log (source, idempotency key, timestamp)
- **Admin Twilio portal** — Twilio cost vs ledger variance, on-demand reconciliation, open-sync repair

## Observability

- **Structured debit logs** — `billing.transaction` (app `logger.info`, Edge `console.info`) on every idempotent ledger write
- **Nightly reconcile snapshots** — `workspace.twilio_data.billingReconciliationSnapshot` written by `twilio-billing-reconcile` cron
- **Admin repair** — Run reconciliation / Repair open sync buttons on Billing Reconciliation panel
- **Webhook inventory** — `node scripts/check-twilio-webhook-coverage.mjs`

## Related docs

- [Number rental billing](./number-rental-billing.md)
- [Pricing strategy brief](./pricing-strategy-brief.md) (original analysis; product now implements Option B)

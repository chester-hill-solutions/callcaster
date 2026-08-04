# Credit floor policy

CallCaster uses a **two-tier** credit policy: **warn** when balance is low, **block** when balance cannot fund new outbound usage.

## Constants (`shared/pricing.ts` / `shared/credit-floor.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `LOW_CREDIT_THRESHOLD` | `NUMBER_RENTAL_MONTHLY_CREDITS` (100) | Banner + email warning via `low_credit_notify` job |
| `OUTBOUND_CREDIT_FLOOR` | `0` | Hard gate for new outbound voice/SMS |

## Warn tier (soft)

When `balance < LOW_CREDIT_THRESHOLD` (strictly below 100):

- Workspace layout shows a low-credit banner (`workspaces+/$id.tsx`)
- Daily `low_credit_notify` job emails workspace owners/admins once (deduped via `twilio_data.lowCreditNotification`)
- A balance of exactly `LOW_CREDIT_THRESHOLD` does **not** warn (e.g. new workspace welcome grant)

Number rental cron uses a **separate** affordability check: monthly rental debits require `balance >= NUMBER_RENTAL_MONTHLY_CREDITS`; otherwise the number is marked unpaid (no silent negative balance).

## Block tier (hard)

When `hasInsufficientCreditsForOutbound(balance)` is true (`balance === null` or `balance <= OUTBOUND_CREDIT_FLOOR`):

New outbound operations return **HTTP 402** with `creditsError: true` (or equivalent error body):

| Path | Module |
|------|--------|
| Staffed / queue dial | `app/routes/api+/dial.action.server.ts` |
| IVR outbound | `app/routes/api+/ivr.action.server.ts` |
| Auto-dial conference start | `app/lib/auto-dial-start.server.ts` |
| Connect phone device (browser dial) | `app/routes/api+/connect-phone-device.action.server.ts` |
| Campaign SMS batch send | `app/routes/api+/sms.action.server.ts` |
| 1:1 chat SMS | `app/routes/api+/chat_sms.action.server.ts` |

### What is **not** blocked at the floor

- **Inbound** Twilio traffic (callbacks, IVR inbound legs) — billing is post-paid on terminal status
- **Status webhooks** that debit after delivery (`sms/status`, call status) — usage already occurred
- **Stripe credit purchases** — always allowed
- **Number rental purchase** — gated by `hasCreditsForNumberRental` (requires full month upfront), not the outbound floor helper

### Grace

There is **no negative-balance grace** for new outbound. Existing product behavior blocks at `<= 0`. In-flight calls/messages started while balance was positive may still debit on completion.

## Helper

```ts
import { hasInsufficientCreditsForOutbound, OUTBOUND_CREDIT_FLOOR } from "../../shared/credit-floor";
```

Use this helper at outbound entry points so the floor stays consistent if policy changes.

## Related billing ops (WS-F)

- **Reconciliation drift:** `billing_reconcile` logs `billing_reconcile.material_variance` and emails owners/admins once per reconciliation period when variance exceeds `BILLING_RECONCILIATION_VARIANCE_THRESHOLD` (see `shared/billing-reconciliation.ts`).
- **Debit idempotency:** All debits use `shared/billing-keys.ts` + `debitAmountFromCredits` — see `docs/billing-debit-audit.md`.

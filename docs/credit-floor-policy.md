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

`app/lib/outbound-credit-gate.server.ts` is the single gate every outbound
entry point calls — it owns the balance read, the unknown-workspace
distinction, and the one locked blocked-response shape, so no call site
hand-rolls its own credit check or its own error body anymore.

```ts
import {
  requireOutboundCredits,
  outboundCreditsResponse,        // route sites: 404 for an unknown workspace
  outboundCreditsBlockedResponse, // fail-closed sites: 402 either way
} from "@/lib/outbound-credit-gate.server";
```

`requireOutboundCredits(workspaceId)` reads the balance and returns a plain
discriminated result — no HTTP in it, so service-layer callers (not just
route handlers) can use it directly:

```ts
type OutboundCreditsResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "workspace_not_found" }
  | { ok: false; reason: "insufficient_credits"; balance: number };
```

Blocked outbound sends always return the same body:

```json
{ "error": "Insufficient credits", "creditsError": true }
```

at **HTTP 402**. An unknown workspace (`balance === null`, i.e. the
workspace row doesn't exist) is handled one of two ways, chosen per call
site:

- **`outboundCreditsResponse`** — throws a uniform 404 (the same
  `AppError("Workspace not found", 404, NOT_FOUND)` shape
  `requireWorkspaceAccess` produces, ADR-0004's workspace-probe-resistance
  convention). Used where the credit check is effectively also the
  workspace-existence check.
- **`outboundCreditsBlockedResponse`** — always the 402 blocked body,
  folding `workspace_not_found` into the same outcome as insufficient
  credits. Used where an earlier `requireWorkspaceAccess` / capability
  check already guarantees the workspace exists, so `workspace_not_found`
  here can only be a TOCTOU race and failing closed is the safer default.

| Path | Module | Unknown-workspace handling |
|------|--------|------|
| Staffed / queue dial | `app/routes/api+/dial.action.server.ts` | 404 (`outboundCreditsResponse`) |
| IVR outbound | `app/routes/api+/ivr.action.server.ts` | 404 (`outboundCreditsResponse`) |
| Connect phone device (browser dial) | `app/routes/api+/connect-phone-device.action.server.ts` | 404 (`outboundCreditsResponse`) |
| Auto-dial conference start | `app/lib/auto-dial-start.server.ts` | 404, mapped to `jsonError(..., 404)` by the route caller |
| 1:1 chat SMS | `app/routes/api+/chat_sms.action.server.ts` | 402, fail-closed (`outboundCreditsBlockedResponse`) |
| Chat composer send | `app/routes/workspaces+/$id/chats.action.server.ts` | 402, fail-closed (`outboundCreditsBlockedResponse`) |
| Campaign SMS batch send | `app/lib/campaign-sms-dispatch.server.ts` (via `app/routes/api+/sms.action.server.ts`) | 402, fail-closed (folded into the `"insufficient_credits"` outcome). Inside a batch, a per-dispatch budget (`createDispatchCreditBudget`) reserves each message's estimated cost before its send starts; rows the balance cannot cover stay queued and the batch reports `creditsExhausted`, which the worker treats like the entry gate (#1483). |

### What is **not** blocked at the floor

- **Inbound** Twilio traffic (callbacks, IVR inbound legs) — billing is post-paid on terminal status
- **Status webhooks** that debit after delivery (`sms/status`, call status) — usage already occurred
- **Stripe credit purchases** — always allowed
- **Number rental purchase** — gated by `hasCreditsForNumberRental` (requires full month upfront), not the outbound floor helper

### Grace

There is **no negative-balance grace** for new outbound. Existing product behavior blocks at `<= 0`. In-flight calls/messages started while balance was positive may still debit on completion.

## Helper

New outbound entry points should call `requireOutboundCredits` from
`app/lib/outbound-credit-gate.server.ts` (see Block tier above), not the raw
predicate. `shared/credit-floor.ts`'s `hasInsufficientCreditsForOutbound` /
`OUTBOUND_CREDIT_FLOOR` still exist and back the gate internally — reach for
them directly only in non-route, non-service code that needs the bare floor
comparison (e.g. tests).

```ts
import { hasInsufficientCreditsForOutbound, OUTBOUND_CREDIT_FLOOR } from "../../shared/credit-floor";
```

## Related billing ops (WS-F)

- **Reconciliation drift:** `billing_reconcile` logs `billing_reconcile.material_variance` and emails owners/admins once per reconciliation period when variance exceeds `BILLING_RECONCILIATION_VARIANCE_THRESHOLD` (see `shared/billing-reconciliation.ts`).
- **Debit idempotency:** All debits use `shared/billing-keys.ts` + `debitAmountFromCredits` — see `docs/billing-debit-audit.md`.

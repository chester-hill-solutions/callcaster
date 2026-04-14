# Stripe webhook

Payment confirmation is handled by our backend via a Stripe webhook so we are not dependent on the redirect-after-checkout flow. Configure Stripe to send events to our endpoint.

## Setup

1. **Environment:** Set `STRIPE_WEBHOOK_SECRET` (optional at startup; required for the webhook route to process events). Get the value from Stripe after adding the endpoint.

2. **Stripe Dashboard:** Developers → Webhooks → Add endpoint.

   - **Endpoint URL:** `https://<your-domain>/api/stripe-webhook`
   - **Events to send:** `checkout.session.completed` (and any others you add handling for).
   - After saving, open the endpoint and reveal the **Signing secret**; set it as `STRIPE_WEBHOOK_SECRET`.

3. **Local testing:** Use Stripe CLI to forward webhooks to your local server, e.g. `stripe listen --forward-to localhost:3000/api/stripe-webhook`, and use the printed signing secret as `STRIPE_WEBHOOK_SECRET` for that run.

## Behavior

- **Verification:** Requests are verified using the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`. Invalid or missing signature returns 400.
- **checkout.session.completed:** Reads `metadata.workspaceId` and `metadata.creditAmount` (same as the checkout session created on the billing page), inserts a idempotent transaction history row (idempotency key `stripe_evt:<event.id>`). The database trigger `transaction_history_update_credits` updates the workspace credit balance.
- **Idempotency:** Duplicate events (e.g. Stripe retries) do not double-credit; the same event id is used as the idempotency key.
- **Redirect:** The success URL still redirects users to `/confirm-payment?session_id=...`, which may also record the same purchase using `stripe_session:<session_id>` as the idempotency key. Both paths can run; at most one transaction row per key is inserted.

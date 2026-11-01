# Stripe environments

This is the current read-only audit for #2700, checked on 2026-11-01 UTC. It records the deployed setup. The owner has not yet confirmed the intended sandbox parent, and no configuration was changed by this audit.

## Account map

| CallCaster environment | Stripe account | Mode | Dashboard | App and worker agree | Webhook endpoints |
| --- | --- | --- | --- | --- | --- |
| dev | `acct_1QRvDwFzTNqbqKww` | Test | [Shared test account](https://dashboard.stripe.com/acct_1QRvDwFzTNqbqKww/test) | Yes | 0 |
| QA | `acct_1QRvDwFzTNqbqKww` | Test | [Shared test account](https://dashboard.stripe.com/acct_1QRvDwFzTNqbqKww/test) | Yes | 0 |
| production | `acct_1QxCXMCKD626kdKP` | Live | [Live account](https://dashboard.stripe.com/acct_1QxCXMCKD626kdKP) | Yes | 1 enabled |

Dev and QA currently share an account. This does not meet the requirement for a dedicated dev sandbox. Stripe sandboxes have separate objects and settings; an existing test account must not be described as a dedicated sandbox without verification. See [Stripe sandboxes](https://docs.stripe.com/sandboxes).

The application reads `STRIPE_SECRET_KEY`. The audit called [`GET /v1/account`](https://docs.stripe.com/api/accounts/retrieve) with each app and worker credential and compared the account, mode and credential agreement in memory. No secret values are stored here. Extra legacy variables are outside this task; do not remove them as part of the sandbox setup.

## Webhooks

The complete [`GET /v1/webhook_endpoints`](https://docs.stripe.com/api/webhook_endpoints/list) inventory returned no endpoints for the shared test account. Dev and QA have an app signing-secret variable, but there is no endpoint in that account to receive their Checkout events. The variable's presence does not prove a working webhook.

Production has enabled endpoint `we_1TAELyCKD626kdKPyXzUaxcz`:

- URL: `https://callcaster.ca/api/stripe-webhook`
- Event: `checkout.session.completed`
- API version: `2025-02-24.acacia`
- Mode: live

The endpoint API does not return its signing secret. Matching that secret to the deployed variable, and proving fulfillment, remain separate checks. Do not change production while setting up dev.

## Workspace customer references

The database audit used read-only transactions. Customer verification used Stripe GET requests against each environment's current account. No deployed data or provider objects were changed.

| Environment | Workspaces | Stored customer references | Resolved customer IDs | Synthetic fixture references | Customers without workspace metadata |
| --- | --- | --- | --- | --- | --- |
| dev | 38 | 36 | 35 | 1 | 34 |
| QA | 31 | 29 | 28 | 1 | 28 |
| production | 7 | 7 | 7 | 0 | 5 |

All valid customer IDs resolved in their current account. There were no missing or deleted customers and no conflicting workspace metadata among the checked references. Each non-production environment also contains a synthetic E2E customer reference from `scripts/e2e/seed-database.mjs`; it is not a real Stripe customer ID. Missing historical workspace metadata means that account existence alone does not prove full workspace ownership matching.

A new dev sandbox needs a customer-reference plan. The existing IDs belong to the current account and must not be reused blindly in another account. Preserve workspace billing history; review the mapping before switching the app and worker. Do not delete or reset customer history to make a test pass.

## Remaining work

1. Confirm which live account will own the dedicated dev sandbox. The current production account is the proposed parent, not an approved change.
2. Authorize the Stripe CLI for that live account and inspect its sandboxes. The current CLI profile cannot list them. A failed list is not evidence that none exist.
3. Establish the dedicated dev sandbox and plan the workspace customer references. Align the app and worker with that sandbox.
4. Register the dev webhook for `https://dev.callcaster.ca/api/stripe-webhook`, install its matching signing secret, and verify the events required by the current handler.
5. Confirm QA's intended test setup and production's intended live account. Verify Sai's access to the required dashboard; API access does not prove a person's dashboard access.
6. Use an approved sandbox purchase to prove that the intended workspace receives its purchased credits exactly once, including webhook replay. Keep the receipt as acceptance evidence.

Keep #2700 open until those checks pass. It blocks the existing receipt quantity requirement #1981 and tax requirement #1983. The latter already states 13% Ontario tax; it is not waiting for the owner to choose a rate. The current Checkout request declares exclusive pricing but enables no tax calculation. Check the account's tax registration and configuration before implementing collection.

Preserve `change-request/1981-credit-receipt-quantity` at `8225f5ce77a47c631595c718a42ea7b570bf1843`; reuse it for receipt work after the prerequisite is complete. Stale account and resource cleanup belongs to #2701 and must follow environment acceptance.

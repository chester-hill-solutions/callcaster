# Handler strictness

Every route `action`/`loader` should be defined through the **handler factory**
(`defineAction` / `defineLoader` in `app/lib/handler.server.ts`) so the four
things every handler was doing by hand are centralized, and each handler
**declares its side effects**.

## The factory

```ts
import { defineAction } from "@/lib/handler.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { z } from "zod";

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request), // any existing guard; return its
                                                   // result OR a Response to short-circuit
  input: z.object({ update: z.record(z.string(), z.unknown()) }), // 400 on parse failure
  sideEffects: ["db-write"],                        // declared — feeds the inventory/gate
  handler: async ({ auth, input, params }) => {
    // auth + input are typed from the strategy + schema
    return data(await doThing(auth.workspaceId, input.update));
  },
});
```

The factory: runs `auth` (short-circuits on a `Response`), validates `input`
against the zod schema (auto-400), calls the handler, and maps thrown errors
through `createErrorResponse`. `auth` is pluggable, so it fits both the API style
(`requireJsonAuth`/`requireDualAuth`/`authFor*`) and the workspace-route style
(`getWorkspaceRouteContext(context)`).

Note: the codebase's `createErrorResponse` returns React Router's `data()` result
(not a raw `Response`); the factory's return type accounts for both.

## The gate (ratchet complete — hard fail)

`npm run check:handlers` (in `ci:local`) fails on **any** route `action`/`loader`
not defined via the factory. The migration is done: the 272 hand-written handlers
that were grandfathered in `scripts/handlers-baseline.json` were ratcheted down to
zero, and the baseline (and `tools:handlers:baseline`) has been removed — there is
no grandfather path for new raw handlers.

## Writing a new handler

Wrap the `action`/`loader` in `defineAction`/`defineLoader`: put the auth guard in
`auth`, the body schema in `input`, and the domain logic in `handler`. Watch two
things:
- **Auth failures must be real `Response`s** (the existing guards already return
  `createErrorResponse`/`new Response`) — `data()` is not a `Response`, so a
  `data()` returned from `auth` would not short-circuit.
- The factory maps thrown non-`Response` errors through `createErrorResponse`
  (JSON 500); thrown `Response`s propagate untouched (redirects, 404s).

## Declared side effects must be truthful (facet cross-check)

`check:handlers` also cross-checks each route module's `sideEffects` declarations
against unambiguous side-effect call signals in the same module:

| Declared facet required | When the module calls |
| --- | --- |
| `twilio` | `createWorkspaceTwilioInstance(…)`, `withTwilioRetry(…)` |
| `db-write` (or `credit`) | `tdb.*.insert/update/delete(…)`, mutation RPCs (`rpcCreate*` …), `insert/update/delete*ForWorkspace(…)` |

Signals are call sites, not imports — building TwiML with the `twilio` package is
pure response construction and does not require the `twilio` facet. Grounding:
the retired `verify-audio-session` action declared `["none"]` while instantiating
a workspace Twilio client with no auth strategy; the false declaration hid exactly
what the inventory exists to expose.

**Audit note (2026-07-17):** all actions declaring `["none"]`/`["db-read"]` were
reviewed. Legitimately read-only actions exist (redirect stubs, retired-endpoint
410s, TwiML page routers, CSV/JSON export POSTs), so "an action must declare a
mutation" is NOT a rule. The truthfulness cross-check above is the enforceable
form.

## The `credit` facet is bidirectional

Unlike the one-directional facets above, `credit` is enforced in **both**
directions against a table of credit-write signals — patterns proving a route can
cause a workspace-credit ledger mutation, synchronously in the request or
asynchronously via a worker billing job it enqueues:

| Signal | Timing | Pattern |
| --- | --- | --- |
| `direct-ledger-insert` | sync | `insertTransactionHistoryIdempotent(…)` |
| `direct-debit-math` | sync | `debitAmountFromCredits(…)` |
| `stripe-confirm-or-poll` | sync | `confirmStripeCheckoutSessionForRedirect(…)`, `pollBillingCheckoutSession(…)` |
| `number-purchase` | sync | `purchaseWorkspaceNumber(…)` |
| `workspace-create-welcome-grant` | sync | `createNewWorkspace(…)`, `createWorkspaceForUser(…)` |
| `sync-call-billing` | sync | `processCallStatusWebhook(…)` without `skipBilling: true` |
| `async-call-billing` | async | `CALL_STATUS_SIDE_EFFECTS_JOB_TYPE` enqueue |
| `async-sms-billing` | async | `SMS_STATUS_SIDE_EFFECTS_JOB_TYPE` enqueue |
| `async-rental-billing` | async | `"number_rental_billing"` job enqueue |

Rules:

- A route matching **any** write signal must declare `"credit"` (missed
  declaration = hidden billing path).
- A route declaring `"credit"` must match **a** write signal (stale declaration =
  noise that erodes trust in the inventory). Balance reads
  (`getWorkspaceCreditsBalance`, credit-floor gates before a send) deliberately do
  **not** qualify — gating on balance is not a ledger write.
- Cron-enqueue routes built with `createCronEnqueueAction` declare downstream
  billing via `extraSideEffects: ["credit"]` in the route file (the gate reads
  `extraSideEffects` literals too).

The gate regenerates [`docs/credit-handler-inventory.md`](./credit-handler-inventory.md)
on every run; `ci:local`'s final `git diff --exit-code` fails if it is stale.

Grounding (audit 2026-07-17): six routes could mutate the ledger without
declaring `credit` (both workspace-create actions with the welcome grant, the
call/SMS status webhooks that enqueue billing jobs, the auto-dial status webhook
that bills synchronously, and the number-rental cron enqueue), while the two SMS
send routes declared `credit` but only read balances.

### Relationship to `check:credit-writes`

The two credit gates are complementary layers, not duplicates:

- `check:credit-writes` (`scripts/check-credit-write-paths.mjs`) guards the
  **write mechanism**: any direct `workspace.credits` mutation or raw
  `transaction_history` insert outside the approved ledger modules is banned
  (ADR-0006) — everything must flow through
  `insertTransactionHistoryIdempotent` → `apply_ledger_entry_and_sync_credits`.
- The `credit` facet in `check:handlers` guards the **entry points**: every route
  that can reach that mechanism (directly or via a worker job) is declared and
  inventoried.

## Next strengthen step

Type the signal table's coverage: billing helpers (`processCallStatusWebhook`,
worker enqueue sites) could accept a caller-site identifier so the ledger's
`idempotency_key` provenance can be joined back to the route inventory
mechanically instead of by regex.

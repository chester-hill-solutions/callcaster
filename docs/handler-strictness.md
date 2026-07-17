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

## Next strengthen step

With every handler through the factory, `sideEffects` declarations now cover the
whole route surface. Make them enforceable — e.g. a handler declaring `credit`
must route through the ledger RPC (fold `check:credit-writes` in as a declared
facet), and a mutating handler must declare a non-`db-read` effect. Current
distribution: `db-write` dominates actions; 6 actions declare `["none"]` and 4
declare `["db-read"]` — audit those 10 before promoting "action must declare a
mutation" to a hard rule.

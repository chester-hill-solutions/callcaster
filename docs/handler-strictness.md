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

## The gate (ratchet)

`npm run check:handlers` (in `ci:local`) requires new/changed route modules to
define their handler via the factory. The **272 existing hand-written handlers**
are grandfathered per-file in `scripts/handlers-baseline.json`; the gate fails
only when a file gains a **new raw handler**. Migrate one, then
`npm run tools:handlers:baseline` to ratchet the count down (goal: 0).

## Migrating (the ratchet-down work)

Wrap the existing `action`/`loader` in `defineAction`/`defineLoader`: move the
auth guard into `auth`, the body schema into `input`, and keep the domain logic
in `handler`. Watch two things:
- **Auth failures must be real `Response`s** (the existing guards already return
  `createErrorResponse`/`new Response`) — `data()` is not a `Response`, so a
  `data()` returned from `auth` would not short-circuit.
- Preserve each handler's existing response shape and its route test.

## Next strengthen step

Once a category of handlers is fully migrated, make its `sideEffects` declaration
enforceable — e.g. a handler declaring `credit` must route through the ledger RPC
(fold `check:credit-writes` in as a declared facet), and a mutating handler must
declare a non-`db-read` effect.

/**
 * Handler factory — the one shape every route action/loader should take.
 *
 * Centralizes the four things every handler was doing by hand (auth guard,
 * input validation, error→Response mapping) and forces each to DECLARE its
 * side effects, so the surface is machine-inventoriable. See
 * docs/handler-strictness.md; the `check:handlers` gate requires new
 * action/loader modules to be defined through here.
 *
 *   export const action = defineAction({
 *     auth: ({ request }) => requireJsonAuth(request),   // any existing guard
 *     input: z.object({ update: z.record(z.unknown()) }),
 *     sideEffects: ["db-write"],
 *     handler: async ({ auth, input, params }) => { ... },
 *   });
 *
 * `auth` may return your domain auth object OR a Response (auth failure) — the
 * factory short-circuits on a Response, exactly like the hand-written guards.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { z } from "zod";
import type { ProductCapabilityId } from "@/lib/capabilities";
import { createErrorResponse } from "@/lib/errors.server";

/**
 * Product capability linkage (issue #1242, D2).
 *
 * `sideEffects` is a *claim* the author writes down, which is why the gate
 * cross-checks it against call signals. A capability declaration works the
 * other way round: a route never states which capability it enforces, it
 * enforces one, and the enforcement carries the id. The capability-carrying
 * auth strategies in capability-guard.server.ts take the capability id as an
 * argument, pass that exact value to `requireActorCapability`, and brand
 * themselves with it here; the factory copies the brand onto the handler it
 * builds. So `capabilityOf(loader)` returns the value the guard enforces —
 * there is no second place to write it down and therefore nothing that can
 * disagree with reality.
 *
 * `check:handlers` reads the same strategy call site statically and requires
 * it to equal the `capability` field on the matching API_SURFACE operation
 * (scripts/lib/capability-linkage.mjs).
 */
const ENFORCED_CAPABILITY = Symbol.for("callcaster.handler.enforcedCapability");

type CapabilityBranded = { readonly [ENFORCED_CAPABILITY]: ProductCapabilityId };

/**
 * Brand an auth strategy with the capability it enforces. Call this only from
 * the guard that actually performs the check, passing the same value — the
 * brand is worthless if it is applied anywhere else.
 */
export function withEnforcedCapability<T extends object>(
  capability: ProductCapabilityId,
  strategy: T,
): T & CapabilityBranded {
  return Object.defineProperty(strategy, ENFORCED_CAPABILITY, {
    value: capability,
    enumerable: false,
  }) as T & CapabilityBranded;
}

/** The capability an auth strategy — or a handler built from one — enforces. */
export function capabilityOf(value: unknown): ProductCapabilityId | undefined {
  if (typeof value !== "function" && (typeof value !== "object" || value === null)) {
    return undefined;
  }
  const branded = (value as Partial<CapabilityBranded>)[ENFORCED_CAPABILITY];
  return branded ?? undefined;
}

/** Propagate an auth strategy's capability brand onto the built handler. */
function inheritCapability<T extends object>(handler: T, authFn: unknown): T {
  const capability = capabilityOf(authFn);
  return capability === undefined
    ? handler
    : withEnforcedCapability(capability, handler);
}

/** Declared side effects — the inventory/gate reads these. */
export type SideEffect =
  | "none"
  | "db-read"
  | "db-write"
  | "credit"
  | "twilio"
  | "external"
  | "email";

type AuthFn<Args, A> = (args: Args) => Promise<A | Response> | A | Response;

/** What the factory itself can return: a real Response (auth/input) or the
 * codebase's error-mapper result (`data(...)`, from createErrorResponse). */
type FactoryResponse = Response | ReturnType<typeof createErrorResponse>;

type ActionCtx<A, I> = ActionFunctionArgs & { auth: A; input: I };
type LoaderCtx<A> = LoaderFunctionArgs & { auth: A };

/** Shared guard wrapper: resolve auth (short-circuit on Response), run the body,
 * map thrown errors. The single place defineAction/defineLoader both go through. */
async function withGuards<Args extends { request: Request }, A, R>(
  args: Args,
  authFn: AuthFn<Args, A> | undefined,
  run: (auth: A) => Promise<R | FactoryResponse> | R | FactoryResponse,
): Promise<R | FactoryResponse> {
  try {
    let auth = undefined as A;
    if (authFn) {
      const result = await authFn(args);
      if (result instanceof Response) return result;
      auth = result;
    }
    return await run(auth);
  } catch (error) {
    // Thrown Responses must stay thrown for React Router document loaders
    // (returning them lets SSR render with empty data → 500). Auth strategies
    // that *return* a Response are handled above.
    if (error instanceof Response) throw error;
    return createErrorResponse(error);
  }
}

export function defineAction<A = undefined, I = undefined, R = unknown>(config: {
  /** Auth strategy: return your auth object, or a Response to short-circuit. */
  auth?: AuthFn<ActionFunctionArgs, A>;
  /** zod schema for the JSON body; a parse failure returns 400 automatically. */
  input?: z.ZodType<I>;
  /** What this handler mutates/calls. Required — drives the inventory + gate. */
  sideEffects: SideEffect[];
  handler: (ctx: ActionCtx<A, I>) => Promise<R> | R;
}) {
  const handler = (args: ActionFunctionArgs): Promise<R | FactoryResponse> =>
    withGuards<ActionFunctionArgs, A, R>(args, config.auth, async (auth) => {
      let input = undefined as I;
      if (config.input) {
        const body = await args.request
          .clone()
          .json()
          .catch(() => ({}));
        const parsed = config.input.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid request body", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        input = parsed.data;
      }
      return config.handler({ ...args, auth, input });
    });
  return inheritCapability(handler, config.auth);
}

export function defineLoader<A = undefined, R = unknown>(config: {
  auth?: AuthFn<LoaderFunctionArgs, A>;
  sideEffects: SideEffect[];
  handler: (ctx: LoaderCtx<A>) => Promise<R> | R;
}) {
  const handler = (args: LoaderFunctionArgs): Promise<R | FactoryResponse> =>
    withGuards<LoaderFunctionArgs, A, R>(args, config.auth, (auth) =>
      config.handler({ ...args, auth }),
    );
  return inheritCapability(handler, config.auth);
}

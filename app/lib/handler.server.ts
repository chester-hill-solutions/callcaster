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
import { createErrorResponse } from "@/lib/errors.server";

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
  return (args: ActionFunctionArgs): Promise<R | FactoryResponse> =>
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
}

export function defineLoader<A = undefined, R = unknown>(config: {
  auth?: AuthFn<LoaderFunctionArgs, A>;
  sideEffects: SideEffect[];
  handler: (ctx: LoaderCtx<A>) => Promise<R> | R;
}) {
  return (args: LoaderFunctionArgs): Promise<R | FactoryResponse> =>
    withGuards<LoaderFunctionArgs, A, R>(args, config.auth, (auth) =>
      config.handler({ ...args, auth }),
    );
}

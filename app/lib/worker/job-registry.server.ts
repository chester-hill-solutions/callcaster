import { z } from "zod";
import type { ClaimedJobRow, JobHandler } from "@/lib/worker/poll-jobs.server";
import {
  enqueueJob,
  type EnqueueJobArgs,
  type EnqueueJobResult,
} from "@/lib/worker/enqueue-job.server";

/**
 * Job registry mechanism (ADR-0007 worker, #1239).
 *
 * Before this, a job type's identity was scattered across ~6 hand-maintained
 * lists that could each drift independently: `job-types.server.ts` (constants
 * for a handful of types), `handlers.server.ts`'s `jobHandlers` object
 * (mixing constants and bare string literals), `poll-jobs.server.ts`'s
 * `PAGING_JOB_TYPES`, `ensure-scheduled-jobs.server.ts`'s
 * `SELF_SCHEDULING_JOB_TYPES`, plus every enqueue call site. A typo in any one
 * of them compiles fine and only surfaces at runtime as a dead-lettered job
 * ("No handler registered for job type: X"). Each handler also hand-rolled
 * its own `job.params` narrowing (a `typeof` check per field, sometimes
 * duplicated across handlers), which failed the same way: silently, at
 * runtime, as a dead letter.
 *
 * `defineJob` lets a job type declare its params shape (a zod schema,
 * validated before the handler runs), paging behaviour, and self-scheduling
 * behaviour in one place, next to its handler. The actual registry
 * (`app/lib/worker/handlers.server.ts`) assembles every job type's
 * registration into one list; `jobHandlers`, the paging set, and the
 * self-scheduling set are all DERIVED from that list rather than
 * hand-maintained separately — see `test/job-registry.test.ts` for the
 * equality guard against the sets this replaced.
 *
 * A1 landed the mechanism plus three proof-of-concept types, with the rest on
 * a `legacyJob` escape hatch (no params validation). A2 migrated the
 * remaining twelve onto `defineJob` and deleted `legacyJob` — every
 * registered job type now validates its params.
 */

/** Self-re-enqueuing behaviour for a job type, or `false` if it doesn't. */
export type JobSchedule =
  | {
      /** Extra params merged into the boot-time seed row for this type. */
      seedParams?: Record<string, unknown>;
    }
  | false;

function normalizeSchedule(schedule: JobSchedule | true | undefined): JobSchedule {
  if (schedule === true) return {};
  return schedule ?? false;
}

export type JobDefinition<Type extends string, Params> = {
  /** The `job.type` column value this registration handles. */
  type: Type;
  /** Zod schema `job.params` is parsed against before the handler runs. */
  params: z.ZodType<Params>;
  /**
   * Dead-lettering this type pages on-call (see `PAGING_JOB_TYPES` derivation
   * in `poll-jobs.server.ts`'s consumer, `handlers.server.ts`).
   */
  pages?: boolean;
  /** Self-re-enqueuing type that needs a boot-time seed row. Pass `true` for no extra seed params. */
  schedule?: JobSchedule | true;
  handler: (job: ClaimedJobRow, params: Params) => Promise<unknown>;
};

export type RegisteredJob<Type extends string = string, Params = unknown> = {
  type: Type;
  pages: boolean;
  schedule: JobSchedule;
  /** The zod schema this registration validates `job.params` against. */
  params: z.ZodType<Params>;
  /** The `(job) => Promise<unknown>` shape `jobHandlers`/the poll loop expects. */
  jobHandler: JobHandler;
};

/**
 * Register a job type through the registry: params are validated with zod
 * before the handler runs, and paging/scheduling metadata live next to the
 * handler instead of in separate hand-maintained lists.
 */
export function defineJob<Type extends string, Params>(
  def: JobDefinition<Type, Params>,
): RegisteredJob<Type, Params> {
  const jobHandler: JobHandler = async (job: ClaimedJobRow) => {
    const params = def.params.parse(job.params ?? {});
    return def.handler(job, params);
  };
  return {
    type: def.type,
    pages: def.pages ?? false,
    schedule: normalizeSchedule(def.schedule),
    params: def.params,
    jobHandler,
  };
}

/**
 * Numeric job param with the coercion job handlers used to apply by hand: a
 * finite number, or a non-negative-integer string (tenant-db rows serialize
 * bigint/serial ids as strings — see #1078), falling back to `fallback` for
 * anything else, including absence.
 */
export function legacyNumericParam(fallback: number): z.ZodType<number> {
  return z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    return undefined;
  }, z.number().default(fallback));
}

/**
 * Numeric job param that's REQUIRED instead of defaulted: same finite-number
 * / non-negative-integer-string coercion as `legacyNumericParam`, but a
 * missing, non-numeric, or zero value fails validation with `message` instead
 * of silently falling back. Zero is rejected on purpose — every hand-rolled
 * narrowing this replaces (`if (!uploadId) throw ...`) treated a coerced `0`
 * as "missing" too, since `0` is falsy in JS. Negative numbers are NOT
 * rejected, matching that same falsy check (`!(-5)` is `false`).
 */
export function legacyRequiredNumberParam(message: string): z.ZodType<number> {
  return z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    return 0;
  }, z.number().refine((value) => value !== 0, { message }));
}

/**
 * String job param with the coercion `requireStringParam` (shared.server.ts)
 * has always applied: the value as-is if it's a string, else `undefined`
 * (including absence). Chain `.default(x)` for params that fell back to a
 * literal default instead of staying `undefined` (e.g. `reason ?? "worker"`).
 */
export function legacyStringParam(): z.ZodType<string | undefined> {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : undefined),
    z.string().optional(),
  );
}

/**
 * String job param that's REQUIRED (and non-empty): same string-or-nothing
 * coercion as `legacyStringParam`, but missing/non-string/empty-string fails
 * validation with `message` instead of passing `undefined` through. Matches
 * every hand-rolled `if (!x) throw ...` guard on a `requireStringParam`
 * result — an empty string is falsy in JS, same as `undefined`.
 */
export function legacyRequiredStringParam(message: string): z.ZodType<string> {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(1, message),
  );
}

/**
 * Nullable string job param for params whose hand-rolled narrowing fell back
 * to `null` (not `undefined`) on anything but a string — e.g.
 * `audience_upload`'s `splitNameColumn` and `voterListSource`. Deliberately
 * does NOT validate against an enum even where the field's TS type implies
 * one (`voterListSource`'s `VoterListSource | null`): the original narrowing
 * only ever checked `typeof value === "string"` and cast, so an
 * already-queued row with an out-of-enum string must keep processing rather
 * than dead-letter.
 */
export function legacyNullableStringParam(): z.ZodType<string | null> {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : null),
    z.string().nullable(),
  );
}

/**
 * Object/record job param with the coercion `requireRecordParam` used to
 * apply: the value as-is (no shape validation — arrays pass through
 * unchanged too, matching the old `typeof value === "object" && value !==
 * null` check) if it's a non-null object, else `fallback`. Pass `undefined`
 * as `fallback` for params that were required (no default) in the old code.
 */
export function legacyObjectParam<T>(fallback: T): z.ZodType<T> {
  return z.preprocess(
    (value) => (typeof value === "object" && value !== null ? value : fallback),
    z.custom<T>(() => true),
  );
}

/**
 * Object/record job param that's REQUIRED: same non-null-object coercion as
 * `legacyObjectParam`, but missing/non-object fails validation with
 * `message` instead of passing a fallback through.
 */
export function legacyRequiredObjectParam(
  message: string,
): z.ZodType<Record<string, unknown>> {
  return z.preprocess(
    (value) => (typeof value === "object" && value !== null ? value : undefined),
    z.custom<Record<string, unknown>>(
      (value) => typeof value === "object" && value !== null,
      { message },
    ),
  );
}

type ParamsOf<R> = R extends RegisteredJob<string, infer Params> ? Params : never;
type TypeOf<R> = R extends RegisteredJob<infer Type, unknown> ? Type : never;

export type TypedEnqueueArgs<Type extends string, Params> = Omit<
  EnqueueJobArgs,
  "type" | "params"
> & {
  type: Type;
  params: Params;
};

/**
 * Build a typed `enqueueJob` scoped to a fixed list of `defineJob`
 * registrations: `type` is narrowed to one of the registered literal types,
 * and `params` must match that type's zod-inferred shape (parsed again here,
 * so a bad caller-supplied value fails at enqueue time instead of dequeue
 * time). Wraps the existing untyped `enqueueJob` — every current caller of
 * that function is untouched.
 *
 * Every registered job type gets a real `Params` type as of #1239 A2. No
 * enqueue call site has been migrated onto this yet — that's #1239 A3;
 * `enqueueJob` remains the only path every current caller uses.
 */
export function createTypedEnqueue<const Regs extends readonly RegisteredJob<string, unknown>[]>(
  registrations: Regs,
) {
  type Reg = Regs[number];
  type ParamsMap = { [R in Reg as TypeOf<R>]: ParamsOf<R> };

  return async function enqueueRegisteredJob<Type extends keyof ParamsMap & string>(
    args: TypedEnqueueArgs<Type, ParamsMap[Type]>,
  ): Promise<EnqueueJobResult> {
    const registration = registrations.find(
      (candidate): candidate is Reg => candidate.type === args.type,
    );
    if (!registration) {
      throw new Error(
        `enqueueRegisteredJob: no defineJob registration for type "${args.type}"`,
      );
    }
    const parsed = registration.params.parse(args.params) as Record<string, unknown>;
    return enqueueJob({ ...args, params: parsed });
  };
}

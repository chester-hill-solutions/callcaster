import { z } from "zod";
import type { ClaimedJobRow, JobHandler } from "@/lib/worker/poll-jobs.server";
import {
  enqueueJob,
  type EnqueueJobArgs,
  type EnqueueJobResult,
} from "@/lib/worker/enqueue-job.server";

/**
 * Job registry mechanism (ADR-0007 worker, part 1 of #1239).
 *
 * Before this, a job type's identity was scattered across ~6 hand-maintained
 * lists that could each drift independently: `job-types.server.ts` (constants
 * for a handful of types), `handlers.server.ts`'s `jobHandlers` object
 * (mixing constants and bare string literals), `poll-jobs.server.ts`'s
 * `PAGING_JOB_TYPES`, `ensure-scheduled-jobs.server.ts`'s
 * `SELF_SCHEDULING_JOB_TYPES`, plus every enqueue call site. A typo in any one
 * of them compiles fine and only surfaces at runtime as a dead-lettered job
 * ("No handler registered for job type: X").
 *
 * `defineJob` lets a job type declare its params shape, paging behaviour, and
 * self-scheduling behaviour in one place, next to its handler. The actual
 * registry (`app/lib/worker/handlers.server.ts`) assembles every job type's
 * registration into one list; `jobHandlers`, the paging set, and the
 * self-scheduling set are all DERIVED from that list rather than
 * hand-maintained separately — see `test/job-registry.test.ts` for the
 * equality guard against the sets this replaced.
 *
 * This is the registry MECHANISM only. Only a few job types are registered
 * via `defineJob` so far; the rest go through `legacyJob`, which registers a
 * type's paging/schedule metadata without validating its params (that
 * migration is TODO(#1239 A2)).
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
 * Register a job type WITHOUT param validation — an adapter for types not
 * yet migrated onto `defineJob`. `handler` keeps its existing
 * `(job: ClaimedJobRow) => Promise<unknown>` shape and continues deriving its
 * own params from `job.params` internally, exactly as it does today.
 *
 * TODO(#1239 A2): migrate every `legacyJob` registration onto `defineJob`
 * with a real params schema, then delete this function.
 */
export function legacyJob<Type extends string>(def: {
  type: Type;
  handler: JobHandler;
  pages?: boolean;
  schedule?: JobSchedule | true;
}): RegisteredJob<Type, unknown> {
  return {
    type: def.type,
    pages: def.pages ?? false,
    schedule: normalizeSchedule(def.schedule),
    params: z.unknown(),
    jobHandler: def.handler,
  };
}

/**
 * Numeric job param with the coercion `requireNumberParam` (shared.server.ts)
 * has always applied: a finite number, or a non-negative-integer string
 * (tenant-db rows serialize bigint/serial ids as strings — see #1078),
 * falling back to `fallback` for anything else, including absence.
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
 * Only job types registered via `defineJob` (not `legacyJob`) get a real
 * `Params` type; the rest stay on the untyped `enqueueJob` path until #1239
 * A2 migrates them.
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

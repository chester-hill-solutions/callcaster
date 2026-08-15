import { z } from "zod";
import type { ClaimedJobRow, JobHandler } from "@/lib/worker/poll-jobs.server";
import {
  unsafeEnqueueJob,
  type EnqueueJobArgs,
  type EnqueueJobResult,
} from "@/lib/worker/enqueue-job.server";
import {
  parseTwilioVoiceCallback,
  twilioVoiceCallbackSchema,
  type TwilioVoiceCallback,
} from "@/lib/twilio/voice-callback";

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

/**
 * The minimal shape `createTypedEnqueue`/`createRequeueStoredJob` need: a
 * `job.type` literal paired with the zod schema its params validate against.
 * `RegisteredJob` (below) extends this with handler wiring, but the
 * enqueue-side helpers only ever touch `type`/`params` — keeping their
 * constraint this loose lets a schema-only list (no handler implementations,
 * see `job-params.server.ts`) satisfy it too, which is what lets
 * handler-implementation files import the typed enqueue back without a
 * module cycle through `handlers.server.ts` (#1239 A3).
 */
export type JobParamsEntry<Type extends string = string, Params = unknown> = {
  type: Type;
  params: z.ZodType<Params>;
};

export type RegisteredJob<Type extends string = string, Params = unknown> = JobParamsEntry<
  Type,
  Params
> & {
  pages: boolean;
  schedule: JobSchedule;
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

export type SidAndTwilioParams = {
  sid: string;
  twilioParams: Record<string, string>;
};

/**
 * Shared params schema for the Twilio webhook fast-ack side-effect job
 * types (#1239 A2): each one used to re-implement the same
 * `requireSidAndTwilioParams` narrowing (sid key differs, everything else is
 * identical). One factory, parameterized on the sid field name and the label
 * used in the error message, replaces all three copies.
 *
 * Moved here from `handlers/webhook-adapters.server.ts` in #1239 A3 so
 * `job-params.server.ts` (schema-only, no handler-implementation
 * dependencies — see its module doc) can build these three job types'
 * registrations without importing `webhook-adapters.server.ts`, which would
 * otherwise cycle back through `handlers.server.ts`.
 *
 * `twilioParams` is DELIBERATELY LOOSER than a "real" schema: the old code
 * never validated its values are strings (just `typeof value === "object" &&
 * value !== null`), and neither does `legacyObjectParam`. Exactly equivalent
 * otherwise.
 *
 * `sid` (#1239 A3): `enqueueRegisteredJob`'s `params` argument must match this
 * schema's OUTPUT shape (`{sid, twilioParams}`), not its pre-transform input
 * — so new enqueue call sites pass a `sid` field directly instead of the
 * `callSid`/`messageSid` the old ad-hoc job.params shape used. `callSid` and
 * `messageSid` stay accepted as a fallback so an already-queued job written
 * before this migration still parses correctly at dequeue time.
 */
export function sidAndTwilioParamsSchema(
  sidKey: "callSid" | "messageSid",
  label: string,
): z.ZodType<SidAndTwilioParams> {
  return z
    .object({
      sid: legacyStringParam(),
      callSid: legacyStringParam(),
      messageSid: legacyStringParam(),
      twilioParams: legacyObjectParam<Record<string, string> | undefined>(undefined),
    })
    .transform((value, ctx) => {
      const legacySid = sidKey === "callSid" ? value.callSid : value.messageSid;
      const sid = value.sid ?? legacySid;
      const twilioParams = value.twilioParams;
      if (!sid || !twilioParams) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: missing ${sidKey} or twilioParams`,
        });
        return z.NEVER;
      }
      return { sid, twilioParams };
    });
}

export type VoiceSideEffectsParams = SidAndTwilioParams & {
  /** The webhook body, parsed once by the route that enqueued this job. */
  event: TwilioVoiceCallback;
};

/**
 * Params schema for the VOICE fast-ack side-effect job types
 * (`call_status_side_effects`, `recording_side_effects`) — #1243 E1.
 *
 * Same `{sid, twilioParams}` contract as `sidAndTwilioParamsSchema`, plus the
 * parsed `event`: the route already discriminated the payload at its boundary,
 * so the worker should not re-derive its own view of the same body with a
 * second pass of loose `underCase` reads. `sms_status_side_effects` keeps the
 * plain schema — it is not a voice callback.
 *
 * COMPATIBILITY, both directions:
 * - Rows queued BEFORE this change carry only `{callSid|sid, twilioParams}`.
 *   A missing (or malformed) `event` is re-derived from `twilioParams` with
 *   `parseTwilioVoiceCallback`, so an already-queued job still runs, and runs
 *   through exactly the same parser the route would have used.
 * - Rows queued AFTER it are validated against `twilioVoiceCallbackSchema`, so
 *   a payload written by some other shape falls back to re-deriving
 *   rather than reaching a handler as a half-typed object.
 *
 * `twilioParams` stays on the payload deliberately: it is the raw evidence for
 * dead-letter inspection and requeue, and E2's remaining routes still read it.
 */
export function voiceSideEffectsParamsSchema(
  label: string,
): z.ZodType<VoiceSideEffectsParams> {
  return z
    .object({
      sid: legacyStringParam(),
      callSid: legacyStringParam(),
      twilioParams: legacyObjectParam<Record<string, string> | undefined>(undefined),
      event: z.unknown().optional(),
    })
    .transform((value, ctx) => {
      const sid = value.sid ?? value.callSid;
      const twilioParams = value.twilioParams;
      if (!sid || !twilioParams) {
        ctx.addIssue({
          code: "custom",
          message: `${label}: missing callSid or twilioParams`,
        });
        return z.NEVER;
      }
      const parsed = twilioVoiceCallbackSchema.safeParse(value.event);
      return {
        sid,
        twilioParams,
        event: parsed.success ? parsed.data : parseTwilioVoiceCallback(twilioParams),
      };
    });
}

type ParamsOf<E> = E extends JobParamsEntry<string, infer Params> ? Params : never;
type TypeOf<E> = E extends JobParamsEntry<infer Type, unknown> ? Type : never;

export type TypedEnqueueArgs<Type extends string, Params> = Omit<
  EnqueueJobArgs,
  "type" | "params"
> & {
  type: Type;
  params: Params;
};

/**
 * Build a typed `enqueueJob` scoped to a fixed list of job-param entries
 * (either full `defineJob` registrations or a schema-only `JobParamsEntry`
 * list — see `job-params.server.ts`): `type` is narrowed to one of the
 * registered literal types, and `params` must match that type's zod-inferred
 * shape (parsed again here, so a bad caller-supplied value fails at enqueue
 * time instead of dequeue time). Wraps `unsafeEnqueueJob`.
 *
 * Every registered job type got a real `Params` type as of #1239 A2. As of
 * #1239 A3, every production enqueue call site is migrated onto this (or, for
 * genuinely dynamic types, `requeueStoredJob`) — `unsafeEnqueueJob` is no
 * longer meant to be called directly outside this file.
 */
export function createTypedEnqueue<const Entries extends readonly JobParamsEntry<string, unknown>[]>(
  entries: Entries,
) {
  type Entry = Entries[number];
  type ParamsMap = { [E in Entry as TypeOf<E>]: ParamsOf<E> };

  return async function enqueueRegisteredJob<Type extends keyof ParamsMap & string>(
    args: TypedEnqueueArgs<Type, ParamsMap[Type]>,
  ): Promise<EnqueueJobResult> {
    const entry = entries.find(
      (candidate): candidate is Entry => candidate.type === args.type,
    );
    if (!entry) {
      throw new Error(
        `enqueueRegisteredJob: no defineJob registration for type "${args.type}"`,
      );
    }
    const parsed = entry.params.parse(args.params) as Record<string, unknown>;
    return unsafeEnqueueJob({ ...args, params: parsed });
  };
}

export type StoredJobValidation =
  | { ok: true; type: string; params: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate arbitrary stored `(type, params)` — e.g. a dead-lettered job's
 * DB row — against whichever registration matches `type` at runtime. Unlike
 * `createTypedEnqueue`, `type` here is a plain `string`: this is for
 * genuinely dynamic call sites that can't pin one literal job type at compile
 * time (a dead-letter requeue can be any type; a boot-time self-scheduling
 * seed loop iterates every self-scheduling type). Returns a typed error
 * instead of throwing so callers can report "unknown job type" or "invalid
 * params" without a try/catch.
 */
export function createValidateStoredJobParams<
  const Entries extends readonly JobParamsEntry<string, unknown>[],
>(entries: Entries) {
  return function validateStoredJobParams(
    type: string,
    storedParams: unknown,
  ): StoredJobValidation {
    const entry = entries.find((candidate) => candidate.type === type);
    if (!entry) {
      return { ok: false, error: `No defineJob registration for job type "${type}"` };
    }
    const parsed = entry.params.safeParse(storedParams ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        error: `Stored params failed validation for job type "${type}": ${parsed.error.message}`,
      };
    }
    return { ok: true, type, params: parsed.data as Record<string, unknown> };
  };
}

export type StoredJobRequeueResult =
  | { ok: true; result: EnqueueJobResult }
  | { ok: false; error: string };

/**
 * The single sanctioned escape hatch for enqueueing a job whose type isn't
 * known until runtime (dead-letter requeue, self-scheduling boot seed): runs
 * the same runtime validation `createValidateStoredJobParams` does, then
 * enqueues via `unsafeEnqueueJob` with the validated params — never the raw
 * stored value. Returns a typed error for an unknown type or invalid params
 * instead of enqueueing garbage that would just dead-letter again.
 */
export function createRequeueStoredJob<
  const Entries extends readonly JobParamsEntry<string, unknown>[],
>(
  entries: Entries,
  validate: ReturnType<typeof createValidateStoredJobParams<Entries>> = createValidateStoredJobParams(
    entries,
  ),
) {
  return async function requeueStoredJob(
    type: string,
    storedParams: unknown,
    extra: Omit<EnqueueJobArgs, "type" | "params"> = {},
  ): Promise<StoredJobRequeueResult> {
    const validated = validate(type, storedParams);
    if (!validated.ok) {
      return validated;
    }
    const result = await unsafeEnqueueJob({ ...extra, type: validated.type, params: validated.params });
    return { ok: true, result };
  };
}

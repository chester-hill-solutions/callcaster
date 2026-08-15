import { z } from "zod";
import {
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  CAMPAIGN_DISPATCH_JOB_TYPE,
  CAMPAIGN_EXPORT_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
  ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
} from "@/lib/worker/job-types.server";
import type { JobHandlers } from "@/lib/worker/poll-jobs.server";
import {
  createTypedEnqueue,
  defineJob,
  legacyNullableStringParam,
  legacyNumericParam,
  legacyObjectParam,
  legacyRequiredNumberParam,
  legacyRequiredObjectParam,
  legacyRequiredStringParam,
  legacyStringParam,
  type RegisteredJob,
} from "@/lib/worker/job-registry.server";
import {
  billingReconcileHandler,
  campaignScheduleSyncHandler,
  lowCreditNotifyHandler,
  numberRentalBillingHandler,
  twilioOpenSyncHandler,
  twilioWebhookAuditHandler,
  TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
} from "./handlers/cron.server";
import {
  callStatusSideEffectsHandler,
  recordingSideEffectsHandler,
  sidAndTwilioParamsSchema,
  smsStatusSideEffectsHandler,
} from "./handlers/webhook-adapters.server";
import {
  audienceUploadHandler,
  campaignDispatchHandler,
  campaignExportHandler,
  enqueueWorkspaceComplianceJob,
  webhookDeliveryHandler,
  WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
  workspaceTwilioComplianceHandler,
} from "./handlers/campaign.server";
import { elevenlabsBatchTranscribeHandler } from "./handlers/elevenlabs-batch-transcribe.server";

export { enqueueWorkspaceComplianceJob };

/**
 * The worker job registry (ADR-0007, #1239).
 *
 * `jobHandlers`, `PAGING_JOB_TYPES`, and `SELF_SCHEDULING_JOB_TYPES` below are
 * all DERIVED from this one list instead of being maintained separately — see
 * `app/lib/worker/job-registry.server.ts` for the `defineJob` mechanism and
 * `test/job-registry.test.ts` for the drift guard.
 *
 * Every job type is registered via `defineJob`: params are validated with a
 * zod schema before the handler runs (#1239 A1 landed the mechanism plus
 * three proof-of-concept types; A2 migrated the remaining twelve off the
 * `legacyJob` escape hatch, which no longer exists). Each schema below is a
 * direct translation of the hand-rolled `typeof`-narrowing its handler used
 * to do — see the PR body for a per-type equivalence note (exactly-equivalent
 * vs. deliberately-looser-than-the-old-narrowing, and why).
 */

const twilioOpenSyncParams = z.object({
  callLimit: legacyNumericParam(50),
  messageLimit: legacyNumericParam(50),
  maxAgeMinutes: legacyNumericParam(120),
});

const billingReconcileParams = z.object({
  workspaceId: z.string().optional(),
});

const elevenlabsBatchTranscribeParams = z.object({
  callSid: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(1, "elevenlabs_batch_transcribe: missing callSid"),
  ),
});

/**
 * `workspace_twilio_compliance` — `reason` defaulted to `"worker"` in the
 * handler (`requireStringParam(params, "reason") ?? "worker"`); `workspaceId`
 * and `actorUserId` are resolved against `job.workspace_id`/`job.user_id`
 * first, so both stay optional here. Exactly equivalent.
 */
const workspaceTwilioComplianceParams = z.object({
  workspaceId: legacyStringParam(),
  reason: legacyStringParam().default("worker"),
  actorUserId: legacyStringParam(),
});

/**
 * `audience_upload` — the widest hand-rolled narrowing in the worker.
 * `uploadId`/`audienceId` were `requireNumberParam(...)` then combined into a
 * bundled `if (!uploadId || !audienceId || !workspaceId || !userId) throw`;
 * split into per-field zod failures here (still rejects the same falsy
 * values, including a coerced `0` — see `legacyRequiredNumberParam`).
 * `workspaceId`/`userId` are still resolved against the job row in the
 * handler, so they stay optional in the schema. `headerMapping` and
 * `voterListSource` are DELIBERATELY LOOSER than a "real" schema would be:
 * the old code only checked `typeof`, never validated `headerMapping`'s
 * values are strings or that `voterListSource` is one of the six enum
 * members it's typed as (see `normalizeVoterListSource`, which already runs
 * at the one enqueue site) — this schema preserves that permissiveness so an
 * already-queued row with a shape the old code would have blindly accepted
 * doesn't dead-letter.
 */
const audienceUploadParams = z.object({
  uploadId: legacyRequiredNumberParam("audience_upload: missing or invalid uploadId"),
  audienceId: legacyRequiredNumberParam("audience_upload: missing or invalid audienceId"),
  workspaceId: legacyStringParam(),
  userId: legacyStringParam(),
  fileContent: legacyStringParam().default(""),
  headerMapping: legacyObjectParam<Record<string, string>>({}),
  splitNameColumn: legacyNullableStringParam(),
  voterListSource: legacyNullableStringParam(),
});

/**
 * `campaign_schedule_sync` / `low_credit_notify` — neither handler ever reads
 * `job.params`. `z.unknown()` accepts anything, matching that.
 */
const noParams = z.unknown();

/**
 * `twilio_webhook_audit` — `autoRepair` defaulted to `true` unless explicitly
 * `false` (`params.autoRepair !== false`); the workspace fanout always runs
 * across every workspace and never reads a `workspaceId` param. Exactly
 * equivalent.
 */
const twilioWebhookAuditParams = z.object({
  autoRepair: z.preprocess((value) => value !== false, z.boolean()),
});

/**
 * `number_rental_billing` — only `workspaceId` is read, resolved against
 * `job.workspace_id` first and never required (absence means "fan out across
 * every workspace"). Exactly equivalent.
 */
const numberRentalBillingParams = z.object({
  workspaceId: legacyStringParam(),
});

/**
 * `campaign_export` — `campaignId`/`exportId`/`campaignType` were bundled
 * into one `if (!x || !y...) throw "missing campaignId, exportId,
 * workspaceId, or campaignType"` alongside `workspaceId`; split into
 * per-field zod failures for the three pure-params fields (still rejects the
 * same falsy values), `workspaceId` stays optional here since it's resolved
 * against `job.workspace_id` in the handler. `campaignType`'s
 * message/live_call/robocall restriction is business logic, not narrowing —
 * it stays in the handler exactly as before (same "unsupported campaign
 * type" error). Exactly equivalent.
 */
const campaignExportParams = z.object({
  campaignId: legacyRequiredNumberParam("campaign_export: missing or invalid campaignId"),
  exportId: legacyRequiredStringParam("campaign_export: missing exportId"),
  campaignName: legacyStringParam().default(""),
  campaignType: legacyRequiredStringParam("campaign_export: missing campaignType"),
  workspaceId: legacyStringParam(),
});

/**
 * `campaign_dispatch` — `campaignId` is a pure params field (required, same
 * falsy-including-`0` rejection as the old bundled check); `workspaceId` and
 * `userId` are resolved against the job row in the handler, exactly as
 * before, including the separate "missing userId (launching actor)" error.
 * Exactly equivalent.
 */
const campaignDispatchParams = z.object({
  campaignId: legacyRequiredNumberParam("campaign_dispatch: missing or invalid campaignId"),
  workspaceId: legacyStringParam(),
  userId: legacyStringParam(),
});

/**
 * `webhook_delivery` — `eventCategory`/`eventType`/`payload` were bundled
 * into the same "missing workspaceId, eventCategory, eventType, or payload"
 * check as `workspaceId`; split into per-field zod failures for the three
 * pure-params fields, `workspaceId` stays optional (resolved against
 * `job.workspace_id`). `eventType` is validated against the same two-value
 * enum the old ternary checked (`"INSERT" | "UPDATE"`, anything else was
 * already treated as missing). `optional` mirrors the old `=== true` check.
 * Exactly equivalent.
 */
const webhookDeliveryParams = z.object({
  workspaceId: legacyStringParam(),
  eventCategory: legacyRequiredStringParam("webhook_delivery: missing eventCategory"),
  eventType: z.enum(["INSERT", "UPDATE"]),
  payload: legacyRequiredObjectParam("webhook_delivery: missing payload"),
  optional: z.preprocess((value) => value === true, z.boolean()),
});

/**
 * `call_status_side_effects` / `sms_status_side_effects` /
 * `recording_side_effects` — all three used to call the same
 * `requireSidAndTwilioParams(job, sidKey, label)` helper in
 * webhook-adapters.server.ts; that's now `sidAndTwilioParamsSchema(sidKey,
 * label)`, one shared factory instead of three copies. `twilioParams` is
 * DELIBERATELY LOOSER than a "real" schema: the old code never validated its
 * values are strings (just `typeof value === "object" && value !== null`),
 * and neither does `legacyObjectParam`. Exactly equivalent otherwise.
 */
const callStatusSideEffectsParams = sidAndTwilioParamsSchema(
  "callSid",
  "call_status_side_effects",
);
const smsStatusSideEffectsParams = sidAndTwilioParamsSchema(
  "messageSid",
  "sms_status_side_effects",
);
const recordingSideEffectsParams = sidAndTwilioParamsSchema(
  "callSid",
  "recording_side_effects",
);

// Kept as its own (non-widened) tuple so `createTypedEnqueue` below can infer
// each registration's literal `type` and its zod-inferred `Params` — spread
// into `jobRegistry` as plain `RegisteredJob`s further down.
const registrations = [
  defineJob({
    type: "twilio_open_sync",
    params: twilioOpenSyncParams,
    // Only entry with non-empty seed params: matches the boot-time seed row
    // ensure-scheduled-jobs.server.ts used to hand-maintain for this type.
    schedule: { seedParams: { callLimit: 50, messageLimit: 50, maxAgeMinutes: 120 } },
    handler: (job, params) => twilioOpenSyncHandler(job, params),
  }),
  defineJob({
    type: "billing_reconcile",
    params: billingReconcileParams,
    pages: true,
    schedule: true,
    handler: (job) => billingReconcileHandler(job),
  }),
  defineJob({
    type: ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
    params: elevenlabsBatchTranscribeParams,
    handler: (job) => elevenlabsBatchTranscribeHandler(job),
  }),
  defineJob({
    type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
    params: workspaceTwilioComplianceParams,
    pages: true,
    handler: (job, params) => workspaceTwilioComplianceHandler(job, params),
  }),
  defineJob({
    type: "campaign_schedule_sync",
    params: noParams,
    schedule: true,
    handler: (job) => campaignScheduleSyncHandler(job),
  }),
  defineJob({
    type: "number_rental_billing",
    params: numberRentalBillingParams,
    pages: true,
    schedule: true,
    handler: (job, params) => numberRentalBillingHandler(job, params),
  }),
  defineJob({
    type: "audience_upload",
    params: audienceUploadParams,
    handler: (job, params) => audienceUploadHandler(job, params),
  }),
  defineJob({
    type: "low_credit_notify",
    params: noParams,
    schedule: true,
    handler: (job) => lowCreditNotifyHandler(job),
  }),
  defineJob({
    type: TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
    params: twilioWebhookAuditParams,
    schedule: true,
    handler: (job, params) => twilioWebhookAuditHandler(job, params),
  }),
  defineJob({
    type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
    params: callStatusSideEffectsParams,
    pages: true,
    handler: (job, params) => callStatusSideEffectsHandler(job, params),
  }),
  defineJob({
    type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
    params: smsStatusSideEffectsParams,
    pages: true,
    handler: (job, params) => smsStatusSideEffectsHandler(job, params),
  }),
  defineJob({
    type: RECORDING_SIDE_EFFECTS_JOB_TYPE,
    params: recordingSideEffectsParams,
    handler: (job, params) => recordingSideEffectsHandler(job, params),
  }),
  defineJob({
    type: CAMPAIGN_EXPORT_JOB_TYPE,
    params: campaignExportParams,
    handler: (job, params) => campaignExportHandler(job, params),
  }),
  defineJob({
    type: CAMPAIGN_DISPATCH_JOB_TYPE,
    params: campaignDispatchParams,
    handler: (job, params) => campaignDispatchHandler(job, params),
  }),
  defineJob({
    type: WEBHOOK_DELIVERY_JOB_TYPE,
    params: webhookDeliveryParams,
    handler: (job, params) => webhookDeliveryHandler(job, params),
  }),
] as const;

export const jobRegistry: RegisteredJob[] = [...registrations];

export const jobHandlers: JobHandlers = Object.fromEntries(
  jobRegistry.map((registration) => [registration.type, registration.jobHandler]),
);

/**
 * Typed `enqueueJob`, narrowed to every registered job type: `type` is a
 * literal union instead of `string`, and `params` must match that type's zod
 * schema — an enqueue-time typo or shape mismatch is now a compile error (or
 * a `ZodError` at call time) instead of a dead-lettered job discovered later.
 * Wraps `enqueueJob`; existing untyped callers are unaffected. No call site
 * has been migrated onto this yet — that's #1239 A3.
 */
export const enqueueRegisteredJob = createTypedEnqueue(registrations);

/**
 * Job types whose permanent failure warrants waking someone: the two billing
 * debit paths, the two recurring money jobs, and compliance provisioning.
 * Everything else (exports, uploads, webhook delivery, notifications) is
 * log-only — a customer reports those. DERIVED from `jobRegistry` — see
 * `poll-jobs.server.ts`, which consumes this to decide whether a
 * dead-lettered job pages on-call.
 */
export const PAGING_JOB_TYPES: ReadonlySet<string> = new Set(
  jobRegistry.filter((registration) => registration.pages).map((registration) => registration.type),
);

/**
 * Job types that re-enqueue themselves and therefore need a boot-time seed
 * row (see `ensure-scheduled-jobs.server.ts`). DERIVED from `jobRegistry`.
 */
export const SELF_SCHEDULING_JOB_TYPES: readonly string[] = jobRegistry
  .filter((registration) => registration.schedule !== false)
  .map((registration) => registration.type);

/** Seed params for each self-scheduling type, keyed by type. DERIVED from `jobRegistry`. */
export const SELF_SCHEDULING_SEED_PARAMS: Readonly<Record<string, Record<string, unknown>>> =
  Object.fromEntries(
    jobRegistry
      .filter((registration) => registration.schedule !== false)
      .map((registration) => [
        registration.type,
        (registration.schedule as { seedParams?: Record<string, unknown> }).seedParams ?? {},
      ]),
  );

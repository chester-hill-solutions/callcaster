import { z } from "zod";
import {
  createRequeueStoredJob,
  createTypedEnqueue,
  createValidateStoredJobParams,
  legacyNullableStringParam,
  legacyNumericParam,
  legacyObjectParam,
  legacyRequiredNumberParam,
  legacyRequiredObjectParam,
  legacyRequiredStringParam,
  legacyStringParam,
  sidAndTwilioParamsSchema,
  type JobParamsEntry,
} from "@/lib/worker/job-registry.server";
import {
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  CAMPAIGN_DISPATCH_JOB_TYPE,
  CAMPAIGN_EXPORT_JOB_TYPE,
  ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
  WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
} from "@/lib/worker/job-types.server";

/**
 * Every registered job type's params schema, plus the typed enqueue/requeue
 * surface built from them (#1239 A3).
 *
 * This is a separate module from `handlers.server.ts` on purpose:
 * `handlers.server.ts` imports handler IMPLEMENTATIONS from files like
 * `handlers/cron.server.ts` and `handlers/campaign.server.ts` to build
 * `defineJob` registrations (schema + handler + paging/schedule metadata).
 * Several of those same implementation files need to enqueue/self-reschedule
 * jobs — if they imported `enqueueRegisteredJob` from `handlers.server.ts`,
 * that would cycle straight back through the file that imports them
 * (`handlers.server.ts` -> `handlers/cron.server.ts` -> `handlers.server.ts`).
 *
 * This module has zero dependency on any handler implementation (only
 * `job-registry.server.ts`'s mechanism + `job-types.server.ts`'s literal job
 * type constants), so handler-implementation files can import
 * `enqueueRegisteredJob`/`requeueStoredJob` from HERE instead, with no cycle.
 * `handlers.server.ts` imports these same schema objects to build its
 * `defineJob` registrations, so both the enqueue side and the dequeue side
 * validate against the exact same schema instance — see
 * `test/job-registry.test.ts` for the guard that keeps the two lists in sync.
 */

export const twilioOpenSyncParams = z.object({
  callLimit: legacyNumericParam(50),
  messageLimit: legacyNumericParam(50),
  maxAgeMinutes: legacyNumericParam(120),
});

export const billingReconcileParams = z.object({
  workspaceId: z.string().optional(),
});

export const elevenlabsBatchTranscribeParams = z.object({
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
export const workspaceTwilioComplianceParams = z.object({
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
export const audienceUploadParams = z.object({
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
export const noParams = z.unknown();

/**
 * `twilio_webhook_audit` — `autoRepair` defaulted to `true` unless explicitly
 * `false` (`params.autoRepair !== false`); the workspace fanout always runs
 * across every workspace and never reads a `workspaceId` param. Exactly
 * equivalent.
 */
export const twilioWebhookAuditParams = z.object({
  autoRepair: z.preprocess((value) => value !== false, z.boolean()),
});

/**
 * `number_rental_billing` — only `workspaceId` is read, resolved against
 * `job.workspace_id` first and never required (absence means "fan out across
 * every workspace"). Exactly equivalent.
 */
export const numberRentalBillingParams = z.object({
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
export const campaignExportParams = z.object({
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
export const campaignDispatchParams = z.object({
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
export const webhookDeliveryParams = z.object({
  workspaceId: legacyStringParam(),
  eventCategory: legacyRequiredStringParam("webhook_delivery: missing eventCategory"),
  eventType: z.enum(["INSERT", "UPDATE"]),
  payload: legacyRequiredObjectParam("webhook_delivery: missing payload"),
  optional: z.preprocess((value) => value === true, z.boolean()),
});

export const callStatusSideEffectsParams = sidAndTwilioParamsSchema(
  "callSid",
  "call_status_side_effects",
);
export const smsStatusSideEffectsParams = sidAndTwilioParamsSchema(
  "messageSid",
  "sms_status_side_effects",
);
export const recordingSideEffectsParams = sidAndTwilioParamsSchema(
  "callSid",
  "recording_side_effects",
);

/**
 * Every registered job type's `{type, params}` pair. `handlers.server.ts`
 * builds its `defineJob` registrations from these SAME schema objects
 * (imported, not redeclared) — see `test/job-registry.test.ts` for the drift
 * guard that keeps this list and `jobRegistry` in sync.
 */
export const jobParamsRegistry = [
  { type: "twilio_open_sync", params: twilioOpenSyncParams },
  { type: "billing_reconcile", params: billingReconcileParams },
  { type: ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE, params: elevenlabsBatchTranscribeParams },
  { type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE, params: workspaceTwilioComplianceParams },
  { type: "campaign_schedule_sync", params: noParams },
  { type: "number_rental_billing", params: numberRentalBillingParams },
  { type: "audience_upload", params: audienceUploadParams },
  { type: "low_credit_notify", params: noParams },
  { type: TWILIO_WEBHOOK_AUDIT_JOB_TYPE, params: twilioWebhookAuditParams },
  { type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE, params: callStatusSideEffectsParams },
  { type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE, params: smsStatusSideEffectsParams },
  { type: RECORDING_SIDE_EFFECTS_JOB_TYPE, params: recordingSideEffectsParams },
  { type: CAMPAIGN_EXPORT_JOB_TYPE, params: campaignExportParams },
  { type: CAMPAIGN_DISPATCH_JOB_TYPE, params: campaignDispatchParams },
  { type: WEBHOOK_DELIVERY_JOB_TYPE, params: webhookDeliveryParams },
] as const satisfies readonly JobParamsEntry<string, unknown>[];

/** `{ [registered type]: its zod-inferred params type }`, for callers that need the map directly. */
export type JobParamsMap = {
  [E in (typeof jobParamsRegistry)[number] as E["type"]]: z.infer<E["params"]>;
};

/**
 * Typed `enqueueJob`, narrowed to every registered job type: `type` is a
 * literal union instead of `string`, and `params` must match that type's zod
 * schema — an enqueue-time typo or shape mismatch is now a compile error (or
 * a `ZodError` at call time) instead of a dead-lettered job discovered later.
 */
export const enqueueRegisteredJob = createTypedEnqueue(jobParamsRegistry);

/** Pure runtime validation gate — see `createValidateStoredJobParams`'s doc comment. */
export const validateStoredJobParams = createValidateStoredJobParams(jobParamsRegistry);

/**
 * The escape hatch for genuinely dynamic enqueue sites (dead-letter requeue,
 * self-scheduling boot seed) — see `createRequeueStoredJob`'s doc comment.
 */
export const requeueStoredJob = createRequeueStoredJob(jobParamsRegistry, validateStoredJobParams);

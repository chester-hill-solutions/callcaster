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
  legacyJob,
  legacyNumericParam,
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
 * The worker job registry (ADR-0007, #1239 A1).
 *
 * `jobHandlers`, `PAGING_JOB_TYPES`, and `SELF_SCHEDULING_JOB_TYPES` below are
 * all DERIVED from this one list instead of being maintained separately — see
 * `app/lib/worker/job-registry.server.ts` for the `defineJob`/`legacyJob`
 * mechanism and `test/job-registry.test.ts` for the drift guard.
 *
 * Three types are registered via `defineJob` as a proof of the mechanism:
 * `twilio_open_sync` and `elevenlabs_batch_transcribe` get real params
 * validation, and `billing_reconcile` demonstrates that a single call site
 * now covers what used to be entries in three separate lists (jobHandlers,
 * PAGING_JOB_TYPES, SELF_SCHEDULING_JOB_TYPES). Every other type is
 * registered via `legacyJob`, which carries paging/schedule metadata without
 * validating params — TODO(#1239 A2): migrate the rest and delete
 * `legacyJob`.
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

// Kept as its own (non-widened) tuple so `createTypedEnqueue` below can infer
// each registration's literal `type` and its zod-inferred `Params` — combined
// into `jobRegistry` as plain `RegisteredJob`s further down.
const typedRegistrations = [
  defineJob({
    type: "twilio_open_sync",
    params: twilioOpenSyncParams,
    // Only entry with non-empty seed params: matches the boot-time seed row
    // ensure-scheduled-jobs.server.ts used to hand-maintain for this type.
    schedule: { seedParams: { callLimit: 50, messageLimit: 50, maxAgeMinutes: 120 } },
    // Params are validated but the handler still derives its own values —
    // that deeper migration is TODO(#1239 A2), same as the legacy types.
    handler: (job) => twilioOpenSyncHandler(job),
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
] as const;

const legacyRegistrations = [
  legacyJob({
    type: WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
    handler: workspaceTwilioComplianceHandler,
    pages: true,
  }),
  legacyJob({
    type: "campaign_schedule_sync",
    handler: campaignScheduleSyncHandler,
    schedule: true,
  }),
  legacyJob({
    type: "number_rental_billing",
    handler: numberRentalBillingHandler,
    pages: true,
    schedule: true,
  }),
  legacyJob({
    type: "audience_upload",
    handler: audienceUploadHandler,
  }),
  legacyJob({
    type: "low_credit_notify",
    handler: lowCreditNotifyHandler,
    schedule: true,
  }),
  legacyJob({
    type: TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
    handler: twilioWebhookAuditHandler,
    schedule: true,
  }),
  legacyJob({
    type: CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
    handler: callStatusSideEffectsHandler,
    pages: true,
  }),
  legacyJob({
    type: SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
    handler: smsStatusSideEffectsHandler,
    pages: true,
  }),
  legacyJob({
    type: RECORDING_SIDE_EFFECTS_JOB_TYPE,
    handler: recordingSideEffectsHandler,
  }),
  legacyJob({
    type: CAMPAIGN_EXPORT_JOB_TYPE,
    handler: campaignExportHandler,
  }),
  legacyJob({
    type: CAMPAIGN_DISPATCH_JOB_TYPE,
    handler: campaignDispatchHandler,
  }),
  legacyJob({
    type: WEBHOOK_DELIVERY_JOB_TYPE,
    handler: webhookDeliveryHandler,
  }),
] as const;

export const jobRegistry: RegisteredJob[] = [
  ...typedRegistrations,
  ...legacyRegistrations,
];

export const jobHandlers: JobHandlers = Object.fromEntries(
  jobRegistry.map((registration) => [registration.type, registration.jobHandler]),
);

/**
 * Typed `enqueueJob`, narrowed to the job types registered via `defineJob`
 * (`twilio_open_sync`, `billing_reconcile`, `elevenlabs_batch_transcribe`):
 * `type` is a literal union instead of `string`, and `params` must match that
 * type's zod schema — an enqueue-time typo or shape mismatch is now a
 * compile error (or a `ZodError` at call time) instead of a dead-lettered job
 * discovered later. Wraps `enqueueJob`; existing untyped callers are
 * unaffected. TODO(#1239 A2): as more types move onto `defineJob`, they gain
 * this for free.
 */
export const enqueueRegisteredJob = createTypedEnqueue(typedRegistrations);

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

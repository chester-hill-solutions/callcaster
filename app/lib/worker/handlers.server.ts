import {
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  CAMPAIGN_DISPATCH_JOB_TYPE,
  CAMPAIGN_EXPORT_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
  ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE,
  TWILIO_WEBHOOK_AUDIT_JOB_TYPE,
  WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE,
} from "@/lib/worker/job-types.server";
import type { JobHandlers } from "@/lib/worker/poll-jobs.server";
import { defineJob, type RegisteredJob } from "@/lib/worker/job-registry.server";
import {
  audienceUploadParams,
  billingReconcileParams,
  callStatusSideEffectsParams,
  campaignDispatchParams,
  campaignExportParams,
  elevenlabsBatchTranscribeParams,
  noParams,
  numberRentalBillingParams,
  recordingSideEffectsParams,
  smsStatusSideEffectsParams,
  twilioOpenSyncParams,
  twilioWebhookAuditParams,
  webhookDeliveryParams,
  workspaceTwilioComplianceParams,
} from "@/lib/worker/job-params.server";
import {
  billingReconcileHandler,
  campaignScheduleSyncHandler,
  lowCreditNotifyHandler,
  numberRentalBillingHandler,
  twilioOpenSyncHandler,
  twilioWebhookAuditHandler,
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
  workspaceTwilioComplianceHandler,
} from "./handlers/campaign.server";
import { elevenlabsBatchTranscribeHandler } from "./handlers/elevenlabs-batch-transcribe.server";

export { enqueueWorkspaceComplianceJob };

// The typed enqueue/requeue surface (`enqueueRegisteredJob`,
// `requeueStoredJob`, `validateStoredJobParams`) is built in
// `job-params.server.ts` from the SAME schema objects imported above, and
// re-exported here as the canonical registry surface for callers outside the
// worker/handlers tree (routes, campaign-execution.server.ts, etc). Handler
// implementation files that need to enqueue/self-reschedule (cron.server.ts,
// campaign.server.ts, webhook-side-effects.server.ts, twilio-open-sync.server.ts)
// import directly from job-params.server.ts instead of from here, to avoid a
// module cycle — see that module's doc comment for why.
export { enqueueRegisteredJob, requeueStoredJob, validateStoredJobParams } from "@/lib/worker/job-params.server";
export type { JobParamsMap } from "@/lib/worker/job-params.server";

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
 * `legacyJob` escape hatch, which no longer exists; A3 migrated every
 * production enqueue call site onto the typed `enqueueRegisteredJob` built
 * from these same schemas — see `job-params.server.ts`). Each schema is a
 * direct translation of the hand-rolled `typeof`-narrowing its handler used
 * to do — see the PR body for a per-type equivalence note (exactly-equivalent
 * vs. deliberately-looser-than-the-old-narrowing, and why).
 */

// Kept as its own (non-widened) tuple so a future consumer needing the
// literal `type`/`Params` union can still infer it — spread into
// `jobRegistry` as plain `RegisteredJob`s further down.
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

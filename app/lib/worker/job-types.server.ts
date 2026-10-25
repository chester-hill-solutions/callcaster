/** Twilio webhook fast-ack side-effect jobs (ADR-0007 worker). */
export const CALL_STATUS_SIDE_EFFECTS_JOB_TYPE = "call_status_side_effects";
export const SMS_STATUS_SIDE_EFFECTS_JOB_TYPE = "sms_status_side_effects";
export const RECORDING_SIDE_EFFECTS_JOB_TYPE = "recording_side_effects";

/**
 * Daily sweep that re-drives `recording_side_effects` for calls whose copy out
 * of Twilio never landed (#2166). Separate from the side-effect job itself so
 * the repair has its own schedule and its own bounded budget.
 */
export const RECORDING_REPAIR_SWEEP_JOB_TYPE = "recording_repair_sweep";

export const WEBHOOK_SIDE_EFFECT_JOB_TYPES = [
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
] as const;

export type WebhookSideEffectJobType =
  (typeof WEBHOOK_SIDE_EFFECT_JOB_TYPES)[number];

export const CAMPAIGN_EXPORT_JOB_TYPE = "campaign_export";
export const CAMPAIGN_DISPATCH_JOB_TYPE = "campaign_dispatch";
export const WEBHOOK_DELIVERY_JOB_TYPE = "webhook_delivery";
export const ELEVENLABS_BATCH_TRANSCRIBE_JOB_TYPE = "elevenlabs_batch_transcribe";

/**
 * Moved here from `handlers/campaign.server.ts` / `handlers/cron.server.ts`
 * in #1239 A3: `job-params.server.ts` needs these literals to build its
 * schema-only registry, and importing them from the handler-implementation
 * files that used to declare them would create a module cycle (those files
 * import `enqueueRegisteredJob` back from `job-params.server.ts`). Both
 * files still export the same name, importing it from here.
 */
export const WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE = "workspace_twilio_compliance";
export const TWILIO_WEBHOOK_AUDIT_JOB_TYPE = "twilio_webhook_audit";

export const PREDICTIVE_MACHINE_CONTINUE_JOB_TYPE =
  "predictive_machine_continue";
export const PREDICTIVE_MACHINE_RECONCILE_JOB_TYPE =
  "predictive_machine_reconcile";

/**
 * Defaults for the Twilio open-sync sweep (#2896), shared by the HTTP cron
 * route, the stored params schema and the handler's successor job so the three
 * cannot drift apart. It lives here, not in job-params.server.ts, because the
 * handler must not import that module: it pulls the job registry, which imports
 * the handlers.
 */
export const TWILIO_OPEN_SYNC_DEFAULTS = {
  callLimit: 50,
  messageLimit: 50,
  maxAgeMinutes: 120,
} as const;

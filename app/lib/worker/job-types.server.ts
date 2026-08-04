/** Twilio webhook fast-ack side-effect jobs (ADR-0007 worker). */
export const CALL_STATUS_SIDE_EFFECTS_JOB_TYPE = "call_status_side_effects";
export const SMS_STATUS_SIDE_EFFECTS_JOB_TYPE = "sms_status_side_effects";
export const RECORDING_SIDE_EFFECTS_JOB_TYPE = "recording_side_effects";

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

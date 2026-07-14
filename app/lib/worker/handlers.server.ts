import {
  CALL_STATUS_SIDE_EFFECTS_JOB_TYPE,
  CAMPAIGN_DISPATCH_JOB_TYPE,
  CAMPAIGN_EXPORT_JOB_TYPE,
  RECORDING_SIDE_EFFECTS_JOB_TYPE,
  SMS_STATUS_SIDE_EFFECTS_JOB_TYPE,
  WEBHOOK_DELIVERY_JOB_TYPE,
} from "@/lib/worker/job-types.server";
import type { JobHandlers } from "@/lib/worker/poll-jobs.server";
import {
  billingReconcileHandler,
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

export { enqueueWorkspaceComplianceJob };

export const jobHandlers: JobHandlers = {
  twilio_open_sync: twilioOpenSyncHandler,
  [WORKSPACE_TWILIO_COMPLIANCE_JOB_TYPE]: workspaceTwilioComplianceHandler,
  billing_reconcile: billingReconcileHandler,
  number_rental_billing: numberRentalBillingHandler,
  audience_upload: audienceUploadHandler,
  low_credit_notify: lowCreditNotifyHandler,
  [TWILIO_WEBHOOK_AUDIT_JOB_TYPE]: twilioWebhookAuditHandler,
  [CALL_STATUS_SIDE_EFFECTS_JOB_TYPE]: callStatusSideEffectsHandler,
  [SMS_STATUS_SIDE_EFFECTS_JOB_TYPE]: smsStatusSideEffectsHandler,
  [RECORDING_SIDE_EFFECTS_JOB_TYPE]: recordingSideEffectsHandler,
  [CAMPAIGN_EXPORT_JOB_TYPE]: campaignExportHandler,
  [CAMPAIGN_DISPATCH_JOB_TYPE]: campaignDispatchHandler,
  [WEBHOOK_DELIVERY_JOB_TYPE]: webhookDeliveryHandler,
};

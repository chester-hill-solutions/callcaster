import { Resend } from "resend";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
  patchWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { listWorkspaceOwnerAdminEmails } from "@/lib/workspace-members-db.server";
import { isObject } from "@/lib/type-safety-utils";
import {
  buildBillingReconciliationAlertDetails,
  type BillingReconciliationReport,
} from "../../shared/billing-reconciliation";
import {
  getBillingReconciliationDriftMarker,
  shouldSendBillingReconciliationDriftEmail,
  type BillingReconciliationDriftMarker,
} from "../../shared/billing-reconciliation-alert";
import type { BillingReconciliationSnapshot } from "@/lib/billing-reconciliation-snapshot.server";

export type { BillingReconciliationDriftMarker };
export {
  getBillingReconciliationDriftMarker,
  shouldSendBillingReconciliationDriftEmail,
} from "../../shared/billing-reconciliation-alert";

function buildDriftEmail(args: {
  workspaceId: string;
  snapshot: BillingReconciliationSnapshot;
  details: ReturnType<typeof buildBillingReconciliationAlertDetails>;
}) {
  const billingUrl = `${env.BASE_URL()}/workspaces/${args.workspaceId}/billing`;
  const periodLabel = `${args.snapshot.period.startDate} – ${args.snapshot.period.endDate}`;
  return {
    subject: "CallCaster billing reconciliation drift detected",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Billing reconciliation drift</h2>
        <p>Our daily billing reconciliation for period <strong>${periodLabel}</strong>
        found material variance between Twilio usage and your workspace ledger.</p>
        <ul>
          <li>SMS variance: ${args.details.smsVariance}</li>
          <li>Voice variance: ${args.details.voiceVariance}</li>
          <li>Message entity gap: ${args.details.messageGap}</li>
          <li>Call entity gap: ${args.details.callGap}</li>
          <li>Unrecognized debit events: ${args.details.unrecognizedDebitEvents}</li>
        </ul>
        <p>Review your billing history or contact support if charges look incorrect.</p>
        <p><a href="${billingUrl}" style="background-color: #c91d25; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View billing</a></p>
      </div>
    `,
    text: `
Billing reconciliation drift

Period: ${periodLabel}
SMS variance: ${args.details.smsVariance}
Voice variance: ${args.details.voiceVariance}
Message entity gap: ${args.details.messageGap}
Call entity gap: ${args.details.callGap}
Unrecognized debit events: ${args.details.unrecognizedDebitEvents}

View billing: ${billingUrl}
    `,
  };
}

async function sendBillingReconciliationDriftEmail(args: {
  workspaceId: string;
  snapshot: BillingReconciliationSnapshot;
  details: ReturnType<typeof buildBillingReconciliationAlertDetails>;
  recipients: string[];
}): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());
  const { subject, html, text } = buildDriftEmail({
    workspaceId: args.workspaceId,
    snapshot: args.snapshot,
    details: args.details,
  });
  await resend.emails.send({
    from: "Callcaster <info@callcaster.ca>",
    to: args.recipients,
    subject,
    html,
    text,
  });
}

/**
 * Structured drift logging plus optional owner/admin email (deduped per period).
 */
export async function handleBillingReconciliationDrift(args: {
  workspaceId: string;
  report: BillingReconciliationReport;
  snapshot: BillingReconciliationSnapshot;
  cleared?: boolean;
}): Promise<{ emailed: boolean; cleared: boolean }> {
  if (args.cleared) {
    const twilioData = await loadWorkspaceTwilioData(args.workspaceId);
    const marker = isObject(twilioData)
      ? getBillingReconciliationDriftMarker(twilioData)
      : null;
    if (marker) {
      await mergeWorkspaceTwilioData(args.workspaceId, (current) => {
        const { billingReconciliationDriftAlert: _drop, ...rest } = current;
        return rest;
      });
      return { emailed: false, cleared: true };
    }
    return { emailed: false, cleared: false };
  }

  const details = buildBillingReconciliationAlertDetails(args.report);
  logger.warn("billing_reconcile.material_variance", {
    workspaceId: args.workspaceId,
    source: args.snapshot.lastRunSource,
    ...details,
  });

  const twilioData = await loadWorkspaceTwilioData(args.workspaceId);
  const marker = isObject(twilioData)
    ? getBillingReconciliationDriftMarker(twilioData)
    : null;
  if (
    !shouldSendBillingReconciliationDriftEmail({
      snapshot: args.snapshot,
      marker,
    })
  ) {
    return { emailed: false, cleared: false };
  }

  const recipients = await listWorkspaceOwnerAdminEmails(args.workspaceId);
  if (recipients.length === 0) {
    logger.warn("billing_reconcile.drift_no_recipients", {
      workspaceId: args.workspaceId,
    });
  } else {
    try {
      await sendBillingReconciliationDriftEmail({
        workspaceId: args.workspaceId,
        snapshot: args.snapshot,
        details,
        recipients,
      });
    } catch (error) {
      logger.error("billing_reconcile.drift_email_failed", {
        workspaceId: args.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { emailed: false, cleared: false };
    }
  }

  await patchWorkspaceTwilioData(args.workspaceId, {
    billingReconciliationDriftAlert: {
      alertedAt: new Date().toISOString(),
      periodStart: args.snapshot.period.startDate,
      periodEnd: args.snapshot.period.endDate,
      smsVariance: args.snapshot.smsVariance,
      voiceVariance: args.snapshot.voiceVariance,
      messageGap: args.snapshot.messageGap,
      callGap: args.snapshot.callGap,
    },
  });

  return { emailed: recipients.length > 0, cleared: false };
}

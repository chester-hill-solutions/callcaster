/**
 * Ops-alert email for Twilio compliance provisioning.
 *
 * Notifies the internal compliance address (`TWILIO_COMPLIANCE_NOTIFY_EMAIL`)
 * when a Trust Hub bundle needs documents / manual action, or when a compliance
 * job terminally fails. This is an internal ops signal — NOT a customer email.
 */

import { Resend } from "resend";
import {
  renderBrandedEmail,
  type BrandedEmailFact,
} from "@/lib/email-layout.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export type ComplianceAlertReason = "action_needed" | "job_failed" | "geo_blocked";

export type ComplianceAlertInput = {
  workspaceId: string;
  reason: ComplianceAlertReason;
  /** Which compliance path triggered the alert. */
  path:
    | "toll_free_bulk_sms"
    | "a2p10dlc"
    | "trusthub"
    | "job"
    | "geo_permissions"
    | "messaging_geo";
  blockingIssues?: string[];
  errorDetail?: string | null;
};

function buildComplianceAlertEmail(input: ComplianceAlertInput) {
  const adminUrl = `${env.BASE_URL()}/admin/workspaces/${input.workspaceId}`;
  const heading =
    input.reason === "action_needed"
      ? "Twilio compliance action needed"
      : input.reason === "geo_blocked"
        ? "Twilio geographic permissions blocked"
        : "Twilio compliance job failed";
  const facts: BrandedEmailFact[] = [
    { label: "Workspace", value: input.workspaceId },
    { label: "Compliance path", value: input.path },
  ];
  if (input.errorDetail) {
    facts.push({ label: "Detail", value: input.errorDetail, tone: "warn" });
  }
  for (const issue of input.blockingIssues ?? []) {
    facts.push({ label: "Blocking issue", value: issue, tone: "warn" });
  }
  return {
    subject: `[CallCaster] ${heading} — workspace ${input.workspaceId}`,
    ...renderBrandedEmail({
      heading,
      facts,
      cta: { label: "Open the workspace in the admin panel", url: adminUrl },
    }),
  };
}

/**
 * Send the internal compliance ops-alert. Never throws — a failed alert must not
 * fail the compliance job that triggered it (errors are logged instead).
 */
export async function sendComplianceOpsAlert(
  input: ComplianceAlertInput,
): Promise<{ sent: boolean }> {
  try {
    const recipient = env.TWILIO_COMPLIANCE_NOTIFY_EMAIL();
    if (!recipient) {
      logger.warn("twilio.compliance.notify.skipped_no_recipient", {
        workspaceId: input.workspaceId,
        reason: input.reason,
      });
      return { sent: false };
    }
    const resend = new Resend(env.RESEND_API_KEY());
    const { subject, html, text } = buildComplianceAlertEmail(input);
    await resend.emails.send({
      from: "Callcaster <info@callcaster.ca>",
      to: [recipient],
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (error) {
    logger.error("twilio.compliance.notify.failed", {
      workspaceId: input.workspaceId,
      reason: input.reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false };
  }
}

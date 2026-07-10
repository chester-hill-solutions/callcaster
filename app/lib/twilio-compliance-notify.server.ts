/**
 * Ops-alert email for Twilio compliance provisioning.
 *
 * Notifies the internal compliance address (`TWILIO_COMPLIANCE_NOTIFY_EMAIL`)
 * when a Trust Hub bundle needs documents / manual action, or when a compliance
 * job terminally fails. This is an internal ops signal — NOT a customer email.
 */

import { Resend } from "resend";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export type ComplianceAlertReason = "action_needed" | "job_failed";

export type ComplianceAlertInput = {
  workspaceId: string;
  reason: ComplianceAlertReason;
  /** Which compliance path triggered the alert. */
  path: "toll_free_bulk_sms" | "a2p10dlc" | "trusthub" | "job";
  blockingIssues?: string[];
  errorDetail?: string | null;
};

function buildComplianceAlertEmail(input: ComplianceAlertInput) {
  const adminUrl = `${env.BASE_URL()}/admin/workspaces/${input.workspaceId}`;
  const heading =
    input.reason === "action_needed"
      ? "Twilio compliance action needed"
      : "Twilio compliance job failed";
  const issues =
    input.blockingIssues && input.blockingIssues.length > 0
      ? `<ul>${input.blockingIssues
          .map((issue) => `<li>${issue}</li>`)
          .join("")}</ul>`
      : "";
  const issuesText =
    input.blockingIssues && input.blockingIssues.length > 0
      ? `\n      Issues:\n${input.blockingIssues.map((i) => `        - ${i}`).join("\n")}`
      : "";
  return {
    subject: `[CallCaster] ${heading} — workspace ${input.workspaceId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${heading}</h2>
        <p>Workspace: <strong>${input.workspaceId}</strong></p>
        <p>Compliance path: <strong>${input.path}</strong></p>
        ${input.errorDetail ? `<p>Detail: ${input.errorDetail}</p>` : ""}
        ${issues}
        <p><a href="${adminUrl}">Open the workspace in the admin panel</a></p>
      </div>
    `,
    text: `${heading}

      Workspace: ${input.workspaceId}
      Compliance path: ${input.path}${input.errorDetail ? `\n      Detail: ${input.errorDetail}` : ""}${issuesText}

      Admin: ${adminUrl}
    `,
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

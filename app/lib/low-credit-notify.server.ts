import { Resend } from "resend";
import { LOW_CREDIT_THRESHOLD } from "../../shared/pricing";
import { renderBrandedEmail } from "@/lib/email-layout.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
  patchWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import {
  getWorkspaceById,
  listAllWorkspacesOrdered,
  listWorkspaceOwnerAdminEmails,
} from "@/lib/workspace-members-db.server";
import { isObject } from "@/lib/type-safety-utils";

export type LowCreditNotificationMarker = {
  notifiedAt: string;
  balance: number;
};

/** Reads the dedupe marker stored under `twilio_data.lowCreditNotification`. */
export function getLowCreditNotificationMarker(
  twilioData: unknown,
): LowCreditNotificationMarker | null {
  if (!isObject(twilioData)) {
    return null;
  }
  const marker = twilioData.lowCreditNotification;
  if (!isObject(marker)) {
    return null;
  }
  const notifiedAt =
    typeof marker.notifiedAt === "string" ? marker.notifiedAt : null;
  const balance = typeof marker.balance === "number" ? marker.balance : null;
  if (!notifiedAt || balance === null) {
    return null;
  }
  return { notifiedAt, balance };
}

function buildEmail(args: {
  workspaceId: string;
  workspaceName: string;
  balance: number;
}) {
  const billingUrl = `${env.BASE_URL()}/workspaces/${args.workspaceId}/billing`;
  const { html, text } = renderBrandedEmail({
    heading: `Your ${args.workspaceName} credits are running low`,
    intro: `Your workspace, ${args.workspaceName}, is below the ${LOW_CREDIT_THRESHOLD}-credit warning threshold.`,
    facts: [
      { label: "Balance", value: `${args.balance} credits`, tone: "warn" },
      { label: "Warning threshold", value: `${LOW_CREDIT_THRESHOLD} credits` },
    ],
    note: {
      text: "Top up now to avoid interruptions to campaigns, calls, and number rentals.",
      tone: "warn",
    },
    cta: { label: "Add credits", url: billingUrl },
    footerLink: {
      label: "Open workspace",
      url: `${env.BASE_URL()}/workspaces/${args.workspaceId}`,
    },
  });
  return {
    subject: `Your ${args.workspaceName} credits are running low`,
    html,
    text,
  };
}

async function sendLowCreditEmail(args: {
  workspaceId: string;
  workspaceName: string;
  balance: number;
  recipients: string[];
}): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());
  const { subject, html, text } = buildEmail({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    balance: args.balance,
  });
  await resend.emails.send({
    from: "Callcaster <info@callcaster.ca>",
    to: args.recipients,
    subject,
    html,
    text,
  });
}

export type LowCreditNotifyResult = {
  ok: true;
  checked: number;
  notified: number;
  cleared: number;
  skippedNoRecipients: number;
};

/**
 * Low-credit email notification sweep.
 *
 * For each workspace at or below LOW_CREDIT_THRESHOLD, emails workspace
 * owners/admins once (deduped via a `lowCreditNotification` marker stored in
 * `workspace.twilio_data`) and clears that marker once the balance recovers
 * above the threshold.
 */
export async function runLowCreditNotify(args?: {
  workspaceId?: string;
}): Promise<LowCreditNotifyResult> {
  let workspaces;
  if (args?.workspaceId) {
    try {
      const workspace = await getWorkspaceById(args.workspaceId);
      workspaces = workspace
        ? [workspace]
        : [{ id: args.workspaceId, name: args.workspaceId }];
    } catch (error) {
      logger.warn("low_credit_notify.workspace_name_lookup_failed", {
        workspaceId: args.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      workspaces = [{ id: args.workspaceId, name: args.workspaceId }];
    }
  } else {
    workspaces = await listAllWorkspacesOrdered();
  }

  let notified = 0;
  let cleared = 0;
  let skippedNoRecipients = 0;

  for (const workspace of workspaces) {
    const workspaceId = workspace.id;
    const balance = await getWorkspaceCreditsBalance(workspaceId);
    if (balance === null) {
      continue;
    }

    const twilioData = await loadWorkspaceTwilioData(workspaceId);
    const marker = getLowCreditNotificationMarker(twilioData);

    // "Low" means strictly below one month of number rental — a balance of
    // exactly LOW_CREDIT_THRESHOLD (e.g. the new-workspace welcome grant)
    // still covers the next renewal and should not alarm anyone.
    if (balance >= LOW_CREDIT_THRESHOLD) {
      if (marker) {
        await mergeWorkspaceTwilioData(workspaceId, (current) => {
          const { lowCreditNotification: _drop, ...rest } = current;
          return rest;
        });
        cleared++;
      }
      continue;
    }

    // Balance is below the threshold.
    if (marker) {
      // Already notified while low; skip until it recovers and re-drops.
      continue;
    }

    try {
      const recipients = await listWorkspaceOwnerAdminEmails(workspaceId);
      if (recipients.length === 0) {
        skippedNoRecipients++;
        logger.warn("low_credit_notify.no_recipients", { workspaceId });
      } else {
        await sendLowCreditEmail({
          workspaceId,
          workspaceName: workspace.name,
          balance,
          recipients,
        });
        notified++;
      }

      await patchWorkspaceTwilioData(workspaceId, {
        lowCreditNotification: {
          notifiedAt: new Date().toISOString(),
          balance,
        },
      });
    } catch (error) {
      logger.error("low_credit_notify.failed", {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    checked: workspaces.length,
    notified,
    cleared,
    skippedNoRecipients,
  };
}

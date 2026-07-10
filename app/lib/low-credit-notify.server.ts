import { Resend } from "resend";
import { LOW_CREDIT_THRESHOLD } from "../../shared/pricing";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
  patchWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import {
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

function buildEmail(args: { workspaceId: string; balance: number }) {
  const billingUrl = `${env.BASE_URL()}/workspaces/${args.workspaceId}/billing`;
  return {
    subject: "Your CallCaster credits are running low",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your credits are running low</h2>
        <p>Your workspace balance is <strong>${args.balance}</strong> credits, below the
        ${LOW_CREDIT_THRESHOLD}-credit warning threshold.</p>
        <p>Top up now to avoid interruptions to campaigns, calls, and number rentals.</p>
        <p><a href="${billingUrl}" style="background-color: #c91d25; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Add credits</a></p>
      </div>
    `,
    text: `
      Your credits are running low

      Your workspace balance is ${args.balance} credits, below the ${LOW_CREDIT_THRESHOLD}-credit warning threshold.
      Top up now to avoid interruptions to campaigns, calls, and number rentals.

      Add credits: ${billingUrl}
    `,
  };
}

async function sendLowCreditEmail(args: {
  workspaceId: string;
  balance: number;
  recipients: string[];
}): Promise<void> {
  const resend = new Resend(env.RESEND_API_KEY());
  const { subject, html, text } = buildEmail({
    workspaceId: args.workspaceId,
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
  const workspaces = args?.workspaceId
    ? [{ id: args.workspaceId }]
    : await listAllWorkspacesOrdered();

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
        await sendLowCreditEmail({ workspaceId, balance, recipients });
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

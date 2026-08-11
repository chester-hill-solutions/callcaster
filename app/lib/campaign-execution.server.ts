import { enqueueJob, type EnqueueJobResult } from "@/lib/worker/enqueue-job.server";
import { getCampaignReadiness, type CampaignReadinessIssue } from "@/lib/campaign-readiness";
import { updateCampaignStatusInWorkspace } from "@/lib/campaign-ivr.server";
import { loadCampaignSmsDispatchData } from "@/lib/sms-campaign-db.server";
import { getCampaignQueueById } from "@/lib/database/campaign.server";
import { logger } from "@/lib/logger.server";
import type { Campaign, LiveCampaign, MessageCampaign, IVRCampaign } from "@/lib/types";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export const CAMPAIGN_DISPATCH_JOB_TYPE = "campaign_dispatch";

/**
 * Evaluate whether a campaign is expired (end_date < now).
 * Pure function, no side effects.
 */
export function isCampaignExpired(
  endDateStr: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!endDateStr) return false;
  const endDate = new Date(endDateStr);
  if (Number.isNaN(endDate.getTime())) return false;
  return endDate < now;
}

export type LaunchCampaignResult =
  | { ok: true; status: "running" | "scheduled"; job?: EnqueueJobResult }
  | { ok: false; error: string; issue?: CampaignReadinessIssue };

/**
 * Launch a campaign (message or voice).
 *
 * 1. Validates configuration readiness.
 * 2. Checks expired dates.
 * 3. Changes campaign status.
 * 4. For message campaigns, enqueues a dispatch job.
 *
 * Voice/IVR campaigns just get the status change (dialer handles dispatch).
 */
export async function launchCampaign(args: {
  workspaceId: string;
  campaignId: string;
  campaign: Campaign;
  campaignDetails: CampaignDetails;
  mode: "now" | "scheduled";
  now?: Date;
  queueCount?: number;
}): Promise<LaunchCampaignResult> {
  const { workspaceId, campaignId, campaign, campaignDetails, mode, queueCount } = args;

  // Validate configuration readiness.
  const readiness = getCampaignReadiness(
    campaign,
    campaignDetails,
    { queueCount: queueCount ?? 0 },
  );
  const readinessError =
    mode === "scheduled" ? readiness.scheduleDisabledReason : readiness.startDisabledReason;
  if (readinessError) {
    return { ok: false, error: readinessError, issue: readiness.issues[0] };
  }

  // Check expired dates.
  if (isCampaignExpired(campaign.end_date, args.now)) {
    return {
      ok: false,
      error: "This campaign's end date has passed. Update the dates or create a new campaign.",
    };
  }

  // Change status.
  const status = mode === "now" ? "running" : "scheduled";
  await updateCampaignStatusInWorkspace(workspaceId, Number(campaignId), {
    status,
    is_active: status === "running",
  });

  // For message campaigns, enqueue dispatch work.
  // Voice campaigns will be dispatched by the dialer.
  if (campaign.type === "message") {
    const job = await enqueueJob({
      type: CAMPAIGN_DISPATCH_JOB_TYPE,
      workspaceId,
      params: {
        workspaceId,
        campaignId: Number(campaignId),
        mode: status,
      },
      dedupe: { kind: "live", workspaceId },
      runAt: mode === "scheduled" ? campaign.start_date : undefined,
    });
    return { ok: true, status, job };
  }

  return { ok: true, status };
}

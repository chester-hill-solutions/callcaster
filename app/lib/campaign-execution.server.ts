import { enqueueJob, type EnqueueJobResult } from "@/lib/worker/enqueue-job.server";
import { getCampaignReadiness, type CampaignReadinessIssue } from "@/lib/campaign-readiness";
import { updateCampaignStatusInWorkspace } from "@/lib/campaign-ivr.server";
import { CAMPAIGN_DISPATCH_JOB_TYPE } from "@/lib/worker/job-types.server";
import type { Campaign, LiveCampaign, MessageCampaign, IVRCampaign } from "@/lib/types";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export { CAMPAIGN_DISPATCH_JOB_TYPE };

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
  /** Authenticated launching actor; attributed on worker dispatch side effects. */
  userId: string;
  now?: Date;
  queueCount?: number;
}): Promise<LaunchCampaignResult> {
  const { workspaceId, campaignId, campaign, campaignDetails, mode, userId, queueCount } = args;

  if (!userId) {
    return { ok: false, error: "A launching user is required to start this campaign." };
  }

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
      userId,
      params: {
        workspaceId,
        campaignId: Number(campaignId),
        userId,
        mode: status,
      },
      dedupe: { kind: "live", workspaceId, campaignId: Number(campaignId) },
      runAt: mode === "scheduled" ? campaign.start_date : undefined,
    });
    return { ok: true, status, job };
  }

  return { ok: true, status };
}

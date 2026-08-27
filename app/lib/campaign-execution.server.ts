import type { EnqueueJobResult } from "@/lib/worker/enqueue-job.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
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
 * Campaign types the worker machine-dials. `live_call` stays human-dialler
 * territory (the calling work area), and message campaigns have their own
 * SMS dispatch — everything else dials itself off the queue.
 */
export const MACHINE_DISPATCHED_VOICE_CAMPAIGN_TYPES = [
  "robocall",
  "simple_ivr",
  "complex_ivr",
] as const;

export function isMachineDispatchedVoiceCampaignType(
  type: string | null | undefined,
): boolean {
  return (MACHINE_DISPATCHED_VOICE_CAMPAIGN_TYPES as readonly string[]).includes(
    type ?? "",
  );
}

/**
 * Launch a campaign (message or machine-dialled voice).
 *
 * 1. Validates configuration readiness.
 * 2. Checks expired dates.
 * 3. Changes campaign status.
 * 4. Enqueues a dispatch job — SMS batches for message campaigns, IVR call
 *    batches for robocall/simple_ivr/complex_ivr.
 *
 * `live_call` campaigns just get the status change (the dialler owns them).
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
  await updateCampaignStatusInWorkspace(workspaceId, Number(campaignId), { status });

  // Enqueue dispatch work for message campaigns (SMS batches) and
  // machine-dialled voice campaigns (IVR call batches). live_call campaigns
  // are dialled by humans in the calling work area.
  if (campaign.type === "message" || isMachineDispatchedVoiceCampaignType(campaign.type)) {
    // `campaignDispatchHandler` reads the campaign's own `status` column, not
    // a `mode` param — this call never passed one through the schema either
    // way (`campaign_dispatch`'s params are `campaignId`/`workspaceId`/`userId`
    // only), so it's dropped here rather than smuggled in as an extra field.
    const job = await enqueueRegisteredJob({
      type: CAMPAIGN_DISPATCH_JOB_TYPE,
      workspaceId,
      userId,
      params: {
        workspaceId,
        campaignId: Number(campaignId),
        userId,
      },
      dedupe: { kind: "live", workspaceId, campaignId: Number(campaignId) },
      runAt: mode === "scheduled" ? campaign.start_date : undefined,
    });
    return { ok: true, status, job };
  }

  return { ok: true, status };
}

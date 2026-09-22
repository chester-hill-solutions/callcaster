import type { EnqueueJobResult } from "@/lib/worker/enqueue-job.server";
import { enqueueRegisteredJob } from "@/lib/worker/job-params.server";
import { findLiveJobId, rescheduleQueuedJob } from "@/lib/worker/enqueue-job.server";
import { getCampaignReadiness, type CampaignReadinessIssue } from "@/lib/campaign-readiness";
import { updateCampaignStatusInWorkspace } from "@/lib/campaign-ivr.server";
import { requireOutboundCredits } from "@/lib/outbound-credit-gate.server";
import { validateScriptSteps } from "@/lib/call-script-service";
import { createTenantDb } from "@/server/tenant-db";
import { script as scriptTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CAMPAIGN_DISPATCH_JOB_TYPE } from "@/lib/worker/job-types.server";
import {
  ivrCallingPolicy,
  nextDispatchOpenAt,
  smsSendPolicy,
} from "@/lib/campaign-dispatch-policy";
import { SEND_WINDOW_MAX_DEFER_MS } from "@/lib/throughput-config";
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
 * Returns a `script_routing_invalid` readiness issue when a machine-dispatched
 * voice campaign's script has a dangling option target or a routing cycle.
 * Null when the campaign is not a voice campaign, has no script, or validates.
 */
export async function scriptRoutingIssue(
  workspaceId: string,
  campaign: Campaign,
  campaignDetails: CampaignDetails,
): Promise<CampaignReadinessIssue | null> {
  if (
    campaign.type == null ||
    !isMachineDispatchedVoiceCampaignType(campaign.type) ||
    campaignDetails == null ||
    !("script_id" in campaignDetails) ||
    campaignDetails.script_id == null
  ) {
    return null;
  }
  const tdb = createTenantDb(workspaceId);
  const scriptRow = await tdb.script.findFirst({
    where: eq(scriptTable.id, campaignDetails.script_id),
    columns: { steps: true },
  });
  if (scriptRow?.steps == null) {
    return null;
  }
  const validation = validateScriptSteps(scriptRow.steps);
  if (validation.ok) {
    return null;
  }
  return {
    code: "script_routing_invalid",
    message: `Script routing is invalid: ${validation.errors.join("; ")}`,
  };
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

  // Routing stopgap (#1884): a machine-dispatched voice campaign with a script
  // whose option routing dangles or cycles must not dial. validateScriptSteps
  // folds the routing check into the structural one.
  const routingError = await scriptRoutingIssue(workspaceId, campaign, campaignDetails);
  if (routingError) {
    return { ok: false, error: routingError.message, issue: routingError };
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
    if (
      mode === "scheduled" &&
      job.deduped &&
      job.jobId != null &&
      campaign.start_date
    ) {
      await rescheduleQueuedJob(job.jobId, campaign.start_date);
    }
    return { ok: true, status, job };
  }

  return { ok: true, status };
}

/**
 * Re-arm dispatch for a campaign whose chain stopped (worker restart, credit
 * pause, lost successor). Idempotent: the live dedupe key means a chain that
 * is still running gets no second job, and the result says so.
 */
export async function kickoffCampaign(args: {
  workspaceId: string;
  campaignId: number;
  campaign: Campaign;
  userId: string;
}): Promise<
  | { ok: true; status: "running"; job: EnqueueJobResult }
  | { ok: false; error: string }
> {
  if (!args.userId) {
    return { ok: false, error: "A launching user is required to kick off this campaign." };
  }

  if (
    args.campaign.type !== "message" &&
    !isMachineDispatchedVoiceCampaignType(args.campaign.type)
  ) {
    return { ok: false, error: "This campaign does not have an automated dispatch queue." };
  }

  const credits = await requireOutboundCredits(args.workspaceId);
  if (!credits.ok) {
    return { ok: false, error: "Insufficient credits" };
  }

  if (args.campaign.status === "paused") {
    await updateCampaignStatusInWorkspace(args.workspaceId, args.campaignId, {
      status: "running",
    });
  }

  const job = await enqueueRegisteredJob({
    type: CAMPAIGN_DISPATCH_JOB_TYPE,
    workspaceId: args.workspaceId,
    userId: args.userId,
    params: {
      workspaceId: args.workspaceId,
      campaignId: args.campaignId,
      userId: args.userId,
    },
    dedupe: {
      kind: "live",
      workspaceId: args.workspaceId,
      campaignId: args.campaignId,
    },
  });

  return { ok: true, status: "running", job };
}

/**
 * After a campaign's calling-hours / SMS send-window is edited while the
 * campaign is live, pull a parked `campaign_dispatch` successor forward to
 * the exact new boundary (#1816). A deferred successor carries the boundary
 * computed at defer time, so editing the window to open earlier (or now)
 * must not leave the chain sleeping at the stale time.
 *
 * Only machine-dispatched campaigns (message, robocall, simple_ivr,
 * complex_ivr) run a dispatch chain. `live_call` is human-dialled and has no
 * successor to reschedule. No live job row means the chain already ended or
 * is mid-tick; the next successor re-reads the campaign fresh, so there is
 * nothing to pull forward.
 *
 * Returns whether a queued successor was rescheduled.
 */
export async function rescheduleDispatchAfterWindowEdit(args: {
  workspaceId: string;
  campaignId: number;
  campaign: Pick<
    Campaign,
    | "type"
    | "status"
    | "schedule"
    | "sms_send_window"
    | "start_date"
    | "end_date"
  >;
  now?: Date;
}): Promise<boolean> {
  const { workspaceId, campaignId, campaign } = args;
  const now = args.now ?? new Date();

  if (
    campaign.type !== "message" &&
    !isMachineDispatchedVoiceCampaignType(campaign.type)
  ) {
    return false;
  }

  // A live chain exists only for running / waiting (waiting = voice parked
  // by the sweep) / scheduled-start campaigns. Draft, paused, complete, and
  // archived campaigns have no successor worth pulling.
  if (
    campaign.status !== "running" &&
    campaign.status !== "waiting" &&
    campaign.status !== "scheduled"
  ) {
    return false;
  }

  const policy =
    campaign.type === "message"
      ? smsSendPolicy(campaign)
      : ivrCallingPolicy(campaign);
  const nextOpenAt = nextDispatchOpenAt(policy, now);
  // Unrestricted (null window) means "send anytime" — wake the chain now so
  // it re-reads the campaign rather than sleeping to a stale boundary.
  const targetMs = nextOpenAt
    ? Math.min(nextOpenAt.getTime(), now.getTime() + SEND_WINDOW_MAX_DEFER_MS)
    : now.getTime();

  const jobId = await findLiveJobId({
    type: CAMPAIGN_DISPATCH_JOB_TYPE,
    workspaceId,
    campaignId,
  });
  if (jobId == null) return false;

  return rescheduleQueuedJob(jobId, new Date(targetMs));
}

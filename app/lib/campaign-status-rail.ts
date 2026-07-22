import type { Campaign, IVRCampaign, LiveCampaign, MessageCampaign } from "@/lib/types";
import type { CampaignStatus } from "@/lib/db-types";
import {
  CAMPAIGN_CONTENT_READINESS_CODES,
  getCampaignReadiness,
  hasAnyCampaignReadinessCode,
  type CampaignReadinessIssue,
  type CampaignReadinessCode,
} from "@/lib/campaign-readiness";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign | null | undefined;

export type CampaignRailItemId =
  | "setup"
  | "content"
  | "queue"
  | "launch"
  | "results"
  | "call";

export type CampaignRailHealth = "ready" | "needs_attention";

export type CampaignRailLaunchLifecycle =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "scheduled"
  | "complete"
  | "archived";

export type CampaignRailResultsStatus = "idle" | "live" | "has_results";

export type CampaignRailCallStatus = "available" | "blocked";

export type CampaignRailPlace =
  | CampaignRailItemId
  | null;

export type CampaignRailItem = {
  id: CampaignRailItemId;
  label: string;
  href: string;
  isCurrent: boolean;
  navigable: boolean;
  health?: CampaignRailHealth;
  launchLifecycle?: CampaignRailLaunchLifecycle;
  resultsStatus?: CampaignRailResultsStatus;
  callStatus?: CampaignRailCallStatus;
  tooltip?: string | null;
};

export type BuildCampaignStatusRailOptions = {
  workspaceId: string;
  campaignId: string | number;
  campaignData: Campaign | null | undefined;
  campaignDetails?: CampaignDetails;
  readinessIssues?: readonly CampaignReadinessIssue[];
  queueCount?: number | null;
  smsMessagingServiceSendersReady?: boolean;
  /** Owner/Admin see full rail; agents see Results (+ Call when live). */
  hasAccess: boolean;
  pathname: string;
  hash?: string;
  joinDisabled?: string | null;
  /** True when results or IVR responses exist. */
  hasResults?: boolean;
};

const SETUP_READINESS_CODES = new Set<CampaignReadinessCode>([
  "campaign_not_loaded",
  "campaign_type_required",
  "outbound_number_required",
  "outbound_number_unavailable",
  "outbound_number_incapable",
  "messaging_sid_required",
  "messaging_senders_unavailable",
  "dates_required",
  "dates_invalid",
  "start_after_end",
  "calling_hours_required",
  "invalid_intervals",
]);

const QUEUE_READINESS_CODES = new Set<CampaignReadinessCode>([
  "queue_empty",
  "bulk_sender_misaligned",
]);

const CONTENT_READINESS_CODES = new Set<CampaignReadinessCode>(
  CAMPAIGN_CONTENT_READINESS_CODES,
);

function healthFromCodes(
  issues: readonly CampaignReadinessIssue[],
  codes: ReadonlySet<CampaignReadinessCode>,
): CampaignRailHealth {
  return hasAnyCampaignReadinessCode(issues, codes)
    ? "needs_attention"
    : "ready";
}

function firstIssueMessage(
  issues: readonly CampaignReadinessIssue[],
  codes: ReadonlySet<CampaignReadinessCode>,
): string | null {
  return issues.find((entry) => codes.has(entry.code))?.message ?? null;
}

export function resolveCampaignRailPlace(
  pathname: string,
  hash = "",
): CampaignRailPlace {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (/\/call\/?$/.test(pathname) || pathname.endsWith("/call")) {
    return "call";
  }
  if (pathname.includes("/script/edit")) {
    return "content";
  }
  if (/\/queue\/?$/.test(pathname) || pathname.endsWith("/queue")) {
    return "queue";
  }
  if (/\/settings\/?$/.test(pathname) || pathname.endsWith("/settings")) {
    return normalizedHash === "campaign-launch" ? "launch" : "setup";
  }
  // Parent campaign path: /workspaces/:id/campaigns/:id (no trailing segment)
  return "results";
}

function launchLifecycleFromStatus(
  status: CampaignStatus | string | null | undefined,
  startReady: boolean,
): CampaignRailLaunchLifecycle {
  switch (status) {
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "scheduled":
      return "scheduled";
    case "complete":
      return "complete";
    case "archived":
      return "archived";
    case "draft":
    case "pending":
    default:
      return startReady ? "ready" : "draft";
  }
}

function launchLifecycleLabel(lifecycle: CampaignRailLaunchLifecycle): string {
  switch (lifecycle) {
    case "draft":
      return "Draft";
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "scheduled":
      return "Scheduled";
    case "complete":
      return "Complete";
    case "archived":
      return "Archived";
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

function resultsStatus(opts: {
  campaignStatus: string | null | undefined;
  hasResults: boolean;
}): CampaignRailResultsStatus {
  if (opts.hasResults) {
    return "has_results";
  }
  if (opts.campaignStatus === "running") {
    return "live";
  }
  return "idle";
}

function campaignBasePath(workspaceId: string, campaignId: string | number): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(String(campaignId))}`;
}

/**
 * Place-first campaign rail: Setup → Content → Queue → Launch → Results (+ Call for live).
 * Status means place health / lifecycle, not wizard step progress.
 */
export function buildCampaignStatusRail(
  options: BuildCampaignStatusRailOptions,
): CampaignRailItem[] {
  const {
    workspaceId,
    campaignId,
    campaignData,
    campaignDetails,
    hasAccess,
    pathname,
    hash = "",
    joinDisabled = null,
    hasResults = false,
  } = options;

  const base = campaignBasePath(workspaceId, campaignId);
  const currentPlace = resolveCampaignRailPlace(pathname, hash);

  const issues =
    options.readinessIssues ??
    getCampaignReadiness(campaignData, campaignDetails, {
      queueCount: options.queueCount,
      smsMessagingServiceSendersReady: options.smsMessagingServiceSendersReady,
    }).issues;

  const startReady = issues.length === 0;
  const isLiveCall = campaignData?.type === "live_call";
  const lifecycle = launchLifecycleFromStatus(campaignData?.status, startReady);
  const results = resultsStatus({
    campaignStatus: campaignData?.status,
    hasResults,
  });

  if (!hasAccess) {
    const agentItems: CampaignRailItem[] = [
      {
        id: "results",
        label: "Results",
        href: base,
        isCurrent: currentPlace === "results",
        navigable: true,
        resultsStatus: results,
      },
    ];
    if (isLiveCall) {
      const blocked = Boolean(joinDisabled);
      agentItems.push({
        id: "call",
        label: "Call",
        href: `${base}/call`,
        isCurrent: currentPlace === "call",
        navigable: !blocked,
        callStatus: blocked ? "blocked" : "available",
        tooltip: joinDisabled,
      });
    }
    return agentItems;
  }

  const setupHealth = healthFromCodes(issues, SETUP_READINESS_CODES);
  const contentHealth = healthFromCodes(issues, CONTENT_READINESS_CODES);
  const queueHealth = healthFromCodes(issues, QUEUE_READINESS_CODES);

  const items: CampaignRailItem[] = [
    {
      id: "setup",
      label: "Setup",
      href: `${base}/settings`,
      isCurrent: currentPlace === "setup",
      navigable: true,
      health: setupHealth,
      tooltip:
        setupHealth === "needs_attention"
          ? firstIssueMessage(issues, SETUP_READINESS_CODES)
          : null,
    },
    {
      id: "content",
      label: "Content",
      href: `${base}/script/edit`,
      isCurrent: currentPlace === "content",
      navigable: true,
      health: contentHealth,
      tooltip:
        contentHealth === "needs_attention"
          ? firstIssueMessage(issues, CONTENT_READINESS_CODES)
          : null,
    },
    {
      id: "queue",
      label: "Queue",
      href: `${base}/queue`,
      isCurrent: currentPlace === "queue",
      navigable: true,
      health: queueHealth,
      tooltip:
        queueHealth === "needs_attention"
          ? firstIssueMessage(issues, QUEUE_READINESS_CODES)
          : null,
    },
    {
      id: "launch",
      label: "Launch",
      href: `${base}/settings#campaign-launch`,
      isCurrent: currentPlace === "launch",
      navigable: true,
      health: startReady ? "ready" : "needs_attention",
      launchLifecycle: lifecycle,
      tooltip: startReady
        ? launchLifecycleLabel(lifecycle)
        : (issues[0]?.message ?? "Finish setup before launching"),
    },
    {
      id: "results",
      label: "Results",
      href: base,
      isCurrent: currentPlace === "results",
      navigable: true,
      resultsStatus: results,
    },
  ];

  if (isLiveCall) {
    const blocked = Boolean(joinDisabled);
    items.push({
      id: "call",
      label: "Call",
      href: `${base}/call`,
      isCurrent: currentPlace === "call",
      navigable: !blocked,
      callStatus: blocked ? "blocked" : "available",
      tooltip: joinDisabled,
    });
  }

  return items;
}

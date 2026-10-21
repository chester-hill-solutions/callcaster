/**
 * Campaign activity is derived from `status` — the single lifecycle truth.
 *
 * The `campaign.is_active` column was a second, drifting source of the same
 * fact (#1216): triggers and RPCs disagreed about who kept it in sync, so a
 * running campaign could be inactive and a drained one could never complete.
 * The public API still serializes an `is_active` field for compatibility,
 * derived here; writes that send it are accepted and ignored.
 */

/** Statuses in which a campaign is actively dispatching or dialable. */
export const ACTIVE_CAMPAIGN_STATUSES = ["running", "waiting"] as const;

/**
 * Campaign lifecycle colors are shared by list bars and campaign headers.
 * Draft and pending intentionally share the neutral color because both mean
 * that the campaign has not entered execution.
 */
const CAMPAIGN_STATUS_COLORS: Record<
  string,
  { bar: string; badge: string }
> = {
  pending: {
    bar: "border-l-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
  },
  draft: {
    bar: "border-l-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
  },
  scheduled: {
    bar: "border-l-blue-500",
    badge: "bg-blue-500/20 text-blue-700 border-blue-500/40 dark:text-blue-300",
  },
  running: {
    bar: "border-l-cyan-500",
    badge: "bg-cyan-500/20 text-cyan-700 border-cyan-500/40 dark:text-cyan-300",
  },
  waiting: {
    bar: "border-l-yellow-500",
    badge: "bg-yellow-500/20 text-yellow-700 border-yellow-500/40 dark:text-yellow-300",
  },
  paused: {
    bar: "border-l-orange-500",
    badge: "bg-orange-500/20 text-orange-700 border-orange-500/40 dark:text-orange-300",
  },
  complete: {
    bar: "border-l-success",
    badge: "bg-success text-success-foreground border-success",
  },
  archived: {
    bar: "border-l-border",
    badge: "bg-slate-500/20 text-slate-700 border-slate-500/40 dark:text-slate-300",
  },
};

export function campaignStatusBarClass(status: string | null | undefined): string {
  return CAMPAIGN_STATUS_COLORS[status?.toLowerCase() ?? ""]?.bar ?? "border-l-border";
}

export function campaignStatusBadgeClass(status: string | null | undefined): string | undefined {
  return CAMPAIGN_STATUS_COLORS[status?.toLowerCase() ?? ""]?.badge;
}

export function isCampaignActive(status: string | null | undefined): boolean {
  return status === "running" || status === "waiting";
}

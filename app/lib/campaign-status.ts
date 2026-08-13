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

export function isCampaignActive(status: string | null | undefined): boolean {
  return status === "running" || status === "waiting";
}

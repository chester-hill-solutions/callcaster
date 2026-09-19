/**
 * Campaigns shown in workspace navigation are grouped by lifecycle status.
 * Keep the four customer-facing groups in this order, then put other statuses
 * (for example paused, scheduled, or archived) after them until product gives
 * those statuses their own navigation order. Newest campaigns appear first
 * inside each group.
 */
const CAMPAIGN_STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  waiting: 1,
  draft: 2,
  complete: 3,
};

type CampaignListItem = {
  status?: string | null;
  created_at?: string | null;
};

function statusPriority(status: string | null | undefined): number {
  return CAMPAIGN_STATUS_PRIORITY[status ?? ""] ?? 4;
}

function createdAtTimestamp(createdAt: string | null | undefined): number {
  const timestamp = Date.parse(createdAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortCampaignsForList<T extends CampaignListItem>(
  campaigns: readonly T[],
): T[] {
  return [...campaigns].sort((left, right) => {
    const statusDifference =
      statusPriority(left.status) - statusPriority(right.status);
    if (statusDifference !== 0) return statusDifference;

    return (
      createdAtTimestamp(right.created_at) - createdAtTimestamp(left.created_at)
    );
  });
}

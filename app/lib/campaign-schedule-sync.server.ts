import { and, inArray, isNotNull, ne } from "drizzle-orm";
import { campaign as campaignTable } from "@/db/schema";
import { adminDb } from "@/server/admin-db";
import { checkSchedule } from "@/lib/database/campaign.server";
import { updateCampaignStatusInWorkspace } from "@/lib/campaign-ivr.server";
import { ACTIVE_CAMPAIGN_STATUSES } from "@/lib/campaign-status";
import { logger } from "@/lib/logger.server";

export type CampaignScheduleSyncResult = {
  scanned: number;
  transitioned: number;
};

/**
 * Flip voice campaigns between `running` and `waiting` to match their calling
 * hours (#1168). `waiting` means "live but outside the schedule": dialing is
 * already gated by checkSchedule regardless of status, so this sync only keeps
 * the displayed status truthful — it never grants or revokes dialability.
 *
 * Scope:
 * - Voice campaigns only. Message campaigns are excluded because their
 *   dispatch chain owns their status (`campaign_dispatch` skips anything that
 *   is not `running`) and their send window is a separate mechanism.
 * - Only campaigns inside their start/end date range. Expiry is owned by the
 *   launch/complete flows; a campaign past its end date keeps whatever status
 *   it has rather than parking on "Waiting" forever.
 */
export async function runCampaignScheduleSync(): Promise<CampaignScheduleSyncResult> {
  const candidates = await adminDb.query.campaign.findMany({
    where: and(
      inArray(campaignTable.status, [...ACTIVE_CAMPAIGN_STATUSES]),
      ne(campaignTable.type, "message"),
      isNotNull(campaignTable.workspace),
    ),
    columns: {
      id: true,
      workspace: true,
      status: true,
      schedule: true,
      start_date: true,
      end_date: true,
    },
  });

  let transitioned = 0;
  const now = new Date();

  for (const row of candidates) {
    if (!row.workspace || !row.start_date || !row.end_date) continue;
    const start = new Date(row.start_date);
    const end = new Date(row.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (now < start || now > end) continue;

    const target = checkSchedule(row) ? "running" : "waiting";
    if (row.status === target) continue;

    try {
      await updateCampaignStatusInWorkspace(row.workspace, row.id, {
        status: target,
      });
      transitioned += 1;
      logger.info("campaign_schedule_sync.transitioned", {
        campaignId: row.id,
        workspaceId: row.workspace,
        from: row.status,
        to: target,
      });
    } catch (error) {
      // One campaign's failed flip must not stop the sweep — the next tick
      // retries it anyway.
      logger.error("campaign_schedule_sync.update_failed", {
        campaignId: row.id,
        workspaceId: row.workspace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { scanned: candidates.length, transitioned };
}

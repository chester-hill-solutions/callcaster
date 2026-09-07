import { eq } from "drizzle-orm";
import { campaign as campaignTable, script as scriptTable } from "@/db/schema";
import type { TenantDb } from "@/server/tenant-db";

/**
 * Counts that decide whether a workspace has "created" something (setup
 * wizard steps, launch checklist). Sample content seeded into every new
 * workspace is excluded, so a fresh workspace is still guided through making
 * its first real campaign and script (#1070).
 */
export function countRealCampaigns(tdb: TenantDb): Promise<number> {
  return tdb.campaign.count({ where: eq(campaignTable.is_sample, false) });
}

export function countRealScripts(tdb: TenantDb): Promise<number> {
  return tdb.script.count({ where: eq(scriptTable.is_sample, false) });
}

/** Same rule for rows already loaded. */
export function countRealCampaignRows(rows: ReadonlyArray<{ is_sample?: boolean | null }>): number {
  return rows.filter((row) => !row.is_sample).length;
}

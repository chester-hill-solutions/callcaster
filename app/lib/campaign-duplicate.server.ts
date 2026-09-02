import {
  insertCampaignAudienceLink,
  listCampaignAudienceIds,
} from "@/lib/campaign-audience-db.server";
import {
  findCampaignInWorkspace,
  insertCampaignForWorkspace,
} from "@/lib/campaign-ivr.server";
import { getCampaignQueueContactIds } from "@/lib/campaign-queue-db.server";
import { logger } from "@/lib/logger.server";
import { isUniqueViolation } from "@/lib/parse-utils.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { getErrorDetail } from "@/lib/user-message";
import { createTenantDb } from "@/server/tenant-db";

export type DuplicateCampaignResult =
  | { ok: true; campaignId: number; title: string }
  | { ok: false; error: string; status: 404 | 409 | 500 };

const COPY_SUFFIX = /\s\(Copy(?: \d+)?\)$/;

/**
 * Picks "<title> (Copy)", then "(Copy 2)", "(Copy 3)", … skipping titles the
 * workspace already uses. Duplicating a copy strips its own suffix first so
 * copies never nest.
 */
export function nextCopyTitle(
  sourceTitle: string | null | undefined,
  existingTitles: Iterable<string>,
): string {
  const taken = new Set(
    Array.from(existingTitles, (title) => title.trim().toLowerCase()),
  );
  const base = String(sourceTitle ?? "").replace(COPY_SUFFIX, "").trim() || "Campaign";
  let candidate = `${base} (Copy)`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    candidate = `${base} (Copy ${n})`;
  }
  return candidate;
}

export async function duplicateCampaign(args: {
  workspaceId: string;
  campaignId: number | string;
}): Promise<DuplicateCampaignResult> {
  const { workspaceId } = args;
  const sourceId = Number(args.campaignId);

  const source = await findCampaignInWorkspace(workspaceId, sourceId);
  if (!source || source.workspace !== workspaceId) {
    return { ok: false, error: "Campaign not found", status: 404 };
  }

  const tdb = createTenantDb(workspaceId);
  const titleRows = (await tdb.campaign.findMany({
    columns: { title: true },
  })) as Array<{ title: string | null }>;
  const title = nextCopyTitle(
    source.title,
    titleRows.flatMap((row) => (row.title ? [row.title] : [])),
  );

  const { id: _id, created_at: _createdAt, ...rest } = source;

  let created: { id: number };
  try {
    created = await insertCampaignForWorkspace(workspaceId, {
      ...rest,
      title,
      status: "draft",
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `A campaign named "${title}" already exists. Try again.`,
        status: 409,
      };
    }
    logger.error("campaign.duplicate.insert_failed", {
      workspaceId,
      sourceId,
      error: getErrorDetail(error),
    });
    return { ok: false, error: "Campaign could not be duplicated", status: 500 };
  }

  const contactIds = await getCampaignQueueContactIds(sourceId, workspaceId);
  if (contactIds.length > 0) {
    await enqueueContactsForCampaign(created.id, contactIds, { requeue: false });
  }

  for (const audienceId of await listCampaignAudienceIds(sourceId)) {
    await insertCampaignAudienceLink(created.id, audienceId);
  }

  return { ok: true, campaignId: created.id, title };
}

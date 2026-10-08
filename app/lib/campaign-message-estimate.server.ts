import { and, asc, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { campaign, campaign_queue, contact, message } from "@/db/schema";
import type { TenantDb } from "@/server/tenant-db";
import { buildDialableCampaignQueueWhere } from "@/lib/campaign-queue-search.server";
import { campaignSmsDuplicateWhere } from "@/lib/message-db.server";
import { normalizePhoneNumber } from "@/lib/phone";
import { isSmsIncapableLineType } from "@/lib/twilio-lookup.server";
import { processTemplateTags } from "@/lib/message-templates";
import { QUEUE_STATUS_QUEUED } from "@/lib/queue-status";
import { MMS_CREDITS, SMS_SEGMENT_CREDITS } from "@/lib/pricing";
import { estimateCampaignCredits, type CampaignCreditEstimate } from "../../shared/campaign-billing";

async function loadPreviouslyMessagedPhones(tdb: TenantDb, campaignId: number, phones: string[]): Promise<Set<string>> {
  const where = campaignSmsDuplicateWhere(campaignId, inArray(message.to, phones));
  const last = await tdb.message.findFirst({ where, orderBy: desc(message.sid), columns: { sid: true } });
  const result = new Set<string>();
  let cursor = "";
  while (last) {
    const rows = await tdb.message.findMany({
      where: and(where, gt(message.sid, cursor), lte(message.sid, last.sid)),
      orderBy: asc(message.sid), columns: { sid: true, to: true }, limit: 1000,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.to !== null) result.add(row.to);
      cursor = row.sid;
    }
    if (cursor === last.sid) break;
  }
  return result;
}

/** Estimate the queued message bodies, with bounded reads and no provider IO. */
export async function loadMessageCampaignCreditEstimate(
  tdb: TenantDb,
  workspaceId: string,
  campaignId: number,
): Promise<CampaignCreditEstimate> {
  const queued = buildDialableCampaignQueueWhere(campaignId, and(
    eq(campaign_queue.queue_state, QUEUE_STATUS_QUEUED), isNull(campaign_queue.dequeued_at),
  ), workspaceId);
  // Bound the scan to existing rows even if another request adds recipients.
  const [saved, last] = await Promise.all([
    tdb.campaign.findFirst({
      where: eq(campaign.id, campaignId),
      columns: { body_text: true, message_media: true },
    }),
    tdb.campaign_queue.findFirst({ where: queued, orderBy: desc(campaign_queue.id), columns: { id: true } }),
  ]);
  if (!saved) throw new Error("Campaign not found for message estimate");
  let cursor = 0;
  let contactCount = 0;
  let totalCredits = 0;
  const selectedPhones = new Set<string>();
  const hasMedia = (saved.message_media?.length ?? 0) > 0;
  while (last && cursor < last.id) {
    const rows = await tdb.campaign_queue.findMany({
      where: and(queued, gt(campaign_queue.id, cursor), lte(campaign_queue.id, last.id)),
      orderBy: asc(campaign_queue.id), columns: { id: true, contact_id: true }, limit: 1000,
    });
    if (rows.length === 0) break;
    const recipients = await tdb.contact.findMany({ where: inArray(contact.id, rows.map(row => row.contact_id)) });
    const byId = new Map(recipients.map(row => [row.id, row]));
    const phones = rows.map(row => {
      const recipient = byId.get(row.contact_id);
      if (!recipient) throw new Error("Queued contact not found in workspace for message estimate");
      return normalizePhoneNumber(recipient.phone ?? "");
    });
    const priorPhones = await loadPreviouslyMessagedPhones(tdb, campaignId, phones);
    for (const row of rows) {
      const recipient = byId.get(row.contact_id);
      if (!recipient) throw new Error("Queued contact not found in workspace for message estimate");
      cursor = row.id;
      const phone = normalizePhoneNumber(recipient.phone ?? "");
      if (recipient.opt_out || isSmsIncapableLineType(recipient.line_type) || selectedPhones.has(phone)) continue;
      selectedPhones.add(phone);
      if (priorPhones.has(phone)) continue;
      totalCredits += estimateCampaignCredits("message", 1, {
        body: processTemplateTags(saved.body_text ?? "", recipient), hasMedia,
      }).totalCredits;
      contactCount += 1;
    }
  }
  return {
    contactCount,
    perContactCredits: contactCount ? totalCredits / contactCount : 0,
    totalCredits,
    rateDescription: `Remaining estimate excludes opt-outs, known landlines and duplicate destinations; uses personalized queued text and current media, assumes unknown line types can receive SMS: ${SMS_SEGMENT_CREDITS} credits per SMS segment; ${MMS_CREDITS} credits per MMS message.`,
  };
}

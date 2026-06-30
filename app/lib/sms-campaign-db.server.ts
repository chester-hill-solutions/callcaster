import { eq } from "drizzle-orm";
import { campaign as campaignTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";

export interface CampaignSmsDispatchData {
  body_text: string;
  message_media: string[];
  campaign: {
    end_time: string;
    sms_send_mode: string | null;
    sms_messaging_service_sid: string | null;
    caller_id: string | null;
  };
}

export async function loadCampaignSmsDispatchData(
  workspaceId: string,
  campaignId: string | number,
  options?: { tdb?: TenantDb },
): Promise<CampaignSmsDispatchData> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const row = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
    columns: {
      body_text: true,
      message_media: true,
      end_date: true,
      sms_send_mode: true,
      sms_messaging_service_sid: true,
      caller_id: true,
    },
  });

  if (!row) {
    throw new Error("Campaign fetch failed: Campaign not found");
  }

  return {
    body_text: row.body_text ?? "",
    message_media: row.message_media ?? [],
    campaign: {
      end_time: row.end_date ?? "",
      sms_send_mode: row.sms_send_mode,
      sms_messaging_service_sid: row.sms_messaging_service_sid,
      caller_id: row.caller_id,
    },
  };
}

export async function loadCampaignVoicedropAudio(
  workspaceId: string,
  campaignId: string | number,
  options?: { tdb?: TenantDb },
): Promise<string | null> {
  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const row = await tdb.campaign.findFirst({
    where: eq(campaignTable.id, Number(campaignId)),
    columns: { voicedrop_audio: true },
  });
  return row?.voicedrop_audio ?? null;
}

import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import {
  deleteAllCampaignQueueForCampaign,
  deleteCampaignQueueByIds,
  updateCampaignQueueStatusByIds,
} from "@/lib/campaign-queue-db.server";
import { searchCampaignQueueIds } from "@/lib/campaign-queue-search.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { parseActionRequest } from "@/lib/database.server";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";
import { verifyAuth } from "@/lib/auth.server";
import { contact_audience as contactAudienceTable } from "@/db/schema";
import { db } from "@/server/db";
import type { Contact } from "@/lib/types";

const EMPTY_FILTERS: QueueSearchFilters = {
  name: "",
  phone: "",
  email: "",
  address: "",
  audiences: "",
  disposition: "",
  queueStatus: "",
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { selected_id } = params;
  await verifyAuth(request);

  if (!selected_id) throw redirect("../../");

  const data = await parseActionRequest(request);
  const intent = data.intent as string;
  const campaignIdNum = parseInt(selected_id, 10);

  if (intent === "update_status") {
    const ids = data.ids;
    const newStatus = data.status as string;
    const isAllSelected =
      data.isAllSelected === true || data.isAllSelected === "true";
    const filters =
      typeof data.filters === "string"
        ? (JSON.parse(data.filters) as QueueSearchFilters)
        : ((data.filters as QueueSearchFilters | undefined) ?? EMPTY_FILTERS);

    try {
      if (isAllSelected) {
        const filteredIds = await searchCampaignQueueIds({
          campaignId: campaignIdNum,
          filters,
        });
        await updateCampaignQueueStatusByIds(filteredIds, newStatus);
      } else {
        const updateIds = (
          Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))
        )
          .map((item: string | { id: string }) =>
            typeof item === "object" ? Number(item.id) : Number(item),
          )
          .filter((id): id is number => Number.isFinite(id));

        await updateCampaignQueueStatusByIds(updateIds, newStatus);
      }

      return routeData({ success: true });
    } catch (error) {
      return routeData({
        success: false,
        error: error instanceof Error ? error.message : "Failed to update queue status",
      });
    }
  }

  if (intent === "add_from_audience") {
    const audienceId = parseInt(String(data.audienceId ?? ""), 10);

    try {
      const contacts = await db
        .select({ contact_id: contactAudienceTable.contact_id })
        .from(contactAudienceTable)
        .where(eq(contactAudienceTable.audience_id, audienceId));

      await enqueueContactsForCampaign(
        campaignIdNum,
        contacts.map((contact) => contact.contact_id),
        { requeue: false },
      );

      return routeData({ success: true });
    } catch (error) {
      return routeData({
        success: false,
        error: error instanceof Error ? error.message : "Failed to add audience to queue",
      });
    }
  }

  if (intent === "add_contacts") {
    const contacts = (
      typeof data.contacts === "string"
        ? JSON.parse(data.contacts)
        : data.contacts
    ) as Contact[];

    try {
      await enqueueContactsForCampaign(
        campaignIdNum,
        contacts.map((contact) => contact.id),
        { requeue: false },
      );

      return routeData({ success: true });
    } catch (error) {
      return routeData({
        success: false,
        error: error instanceof Error ? error.message : "Failed to add contacts to queue",
      });
    }
  }

  if (intent === "remove_contacts") {
    const ids = data.ids;
    const isAllSelected =
      data.isAllSelected === true || data.isAllSelected === "true";

    try {
      if (isAllSelected) {
        await deleteAllCampaignQueueForCampaign(campaignIdNum);
      } else {
        const removeIds = (
          Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))
        )
          .map((item: string | { id: string }) =>
            typeof item === "object" ? Number(item.id) : Number(item),
          )
          .filter((id): id is number => Number.isFinite(id));

        await deleteCampaignQueueByIds(removeIds);
      }

      return routeData({ success: true });
    } catch (error) {
      return routeData({
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove queue contacts",
      });
    }
  }

  return routeData({ success: false, error: "Invalid intent" });
};

import { hasMinRole, workspaceRouteAuth } from "@/lib/workspace-route.server";
import { data as routeData, redirect } from "react-router";
import { eq } from "drizzle-orm";
import {
  deleteAllCampaignQueueForCampaign,
  deleteCampaignQueueByIds,
  updateCampaignQueueStatusByIds,
} from "@/lib/campaign-queue-db.server";
import { searchCampaignQueueIds } from "@/lib/campaign-queue-search.server";
import { campaignAndAudienceShareWorkspace } from "@/lib/campaign-audience-db.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { parseActionRequest } from "@/lib/request-utils.server";
import type { QueueSearchFilters } from "@/lib/campaign-queue-search.server";
import { contact_audience as contactAudienceTable } from "@/db/schema";
// contact_audience is a join table without a workspace column; tdb cannot scope it.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/server/db";
import type { Contact } from "@/lib/types";
import { defineAction } from "@/lib/handler.server";
import { MemberRole } from "@/lib/member-role";
import { toUserMessage } from "@/lib/user-message";

const EMPTY_FILTERS: QueueSearchFilters = {
  name: "",
  phone: "",
  email: "",
  address: "",
  audiences: "",
  disposition: "",
  queueStatus: "",
};

export const action = defineAction({
  auth: workspaceRouteAuth,
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
    const { selected_id } = params;
    const { workspaceId, userRole, headers } = auth;

    if (!selected_id) throw redirect("../../");

    if (!hasMinRole(userRole, MemberRole.Member)) {
      return routeData(
        { error: "You don't have permission to perform this action" },
        { headers, status: 403 },
      );
    }

    const data = await parseActionRequest(request);
    const intent = data.intent as string;
    const campaignIdNum = parseInt(selected_id, 10);

    const campaign = await findCampaignInWorkspace(workspaceId, campaignIdNum);
    if (!campaign) {
      return routeData({ success: false, error: "Campaign not found" }, { status: 404 });
    }

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
            workspaceId,
          });
          await updateCampaignQueueStatusByIds(filteredIds, newStatus, workspaceId);
        } else {
          const updateIds = (
            Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))
          )
            .map((item: string | { id: string }) =>
              typeof item === "object" ? Number(item.id) : Number(item),
            )
            .filter((id: unknown): id is number => typeof id === "number" && Number.isFinite(id));

          await updateCampaignQueueStatusByIds(updateIds, newStatus, workspaceId);
        }

        return routeData({ success: true });
      } catch (error) {
        return routeData({
          success: false,
          error: toUserMessage(error, "Failed to update queue status"),
        });
      }
    }

    if (intent === "add_from_audience") {
      const audienceId = parseInt(String(data.audienceId ?? ""), 10);

      if (!Number.isFinite(audienceId)) {
        return routeData({ success: false, error: "Invalid audience" }, { status: 400 });
      }

      if (!(await campaignAndAudienceShareWorkspace(campaignIdNum, audienceId))) {
        return routeData({ success: false, error: "Audience not found" }, { status: 404 });
      }

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
          error: toUserMessage(error, "Failed to add audience to queue"),
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
          error: toUserMessage(error, "Failed to add contacts to queue"),
        });
      }
    }

    if (intent === "remove_contacts") {
      const ids = data.ids;
      const isAllSelected =
        data.isAllSelected === true || data.isAllSelected === "true";

      try {
        if (isAllSelected) {
          await deleteAllCampaignQueueForCampaign(campaignIdNum, workspaceId);
        } else {
          const removeIds = (
            Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))
          )
            .map((item: string | { id: string }) =>
              typeof item === "object" ? Number(item.id) : Number(item),
            )
            .filter((id: unknown): id is number => typeof id === "number" && Number.isFinite(id));

          await deleteCampaignQueueByIds(removeIds, workspaceId);
        }

        return routeData({ success: true });
      } catch (error) {
        return routeData({
          success: false,
          error: toUserMessage(error, "Failed to remove queue contacts"),
        });
      }
    }

    return routeData({ success: false, error: "Invalid intent" });
  },
});

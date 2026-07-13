import { handleError, parseRequestData } from "@/lib/request-utils.server";
import {
  searchContactsForQueuePicker,
  bulkCreateContacts,
  createContact,
  updateContact,
} from "@/lib/database/contact.server";
import { getQueuedContactIdsForCampaign } from "@/lib/campaign-queue-db.server";
import { Contact } from "@/lib/types";
import { data as routeData } from "react-router";
import { getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";
import { defineLoader } from "@/lib/handler.server";

export async function searchContactsLoader(request: Request) {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.toLowerCase() || "";
  const workspaceId = url.searchParams.get("workspace_id") || "";
  const campaignId = url.searchParams.get("campaign_id") || "";

  if (!searchQuery) {
    return routeData({ data: [] });
  }

  try {
    const allContacts = await searchContactsForQueuePicker(workspaceId, searchQuery);
    if (allContacts.length === 0) {
      return routeData({ contacts: [] });
    }

    const queuedContactIds = await getQueuedContactIdsForCampaign({
      campaignId: Number(campaignId),
      contactIds: allContacts.map((contact) => contact?.id).filter(Boolean) as number[],
    });
    const queuedContactIdSet = new Set(queuedContactIds);
    const contacts = allContacts.map((contact) => ({
      ...contact,
      queued: queuedContactIdSet.has(contact?.id),
    }));
    return routeData({ contacts });
  } catch (err) {
    return handleError(err instanceof Error ? err : new Error(String(err)), "Error searching contacts");
  }
}

export const loader = defineLoader({
  sideEffects: ["db-read"],
  handler: ({ request }) => searchContactsLoader(request),
});

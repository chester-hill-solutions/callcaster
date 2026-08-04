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
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
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

  // `workspace_id` is caller-supplied and flows straight into createTenantDb,
  // which scopes to whatever id it is handed. requireDualAuth proves a session,
  // never membership. No minRole: a `caller` legitimately searches contacts
  // from the chat composer and the queue picker.
  //
  // Outside the try below: that catch reports every failure as a 500, which
  // would turn this gate's 404 into a server error. Let defineLoader map the
  // AppError to its real status instead.
  await requireWorkspaceAccess({ user, workspaceId });

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

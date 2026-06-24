import { data as routeData } from "react-router";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { filteredSearch } from "@/lib/queue-filter-search.server";
import { parseRequestData } from "@/lib/database.server";
import { safeNumber } from "@/lib/type-utils";
import { getDualAuthSupabase, getDualAuthUser, requireDualAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";
import type { CampaignQueue } from "@/lib/types";

interface ContactMapping {
  id: number;
  contact_id: number;
  campaign_id: number;
  status: string;
  created_at: string;
  contact: {
    id: number;
    firstname: string | null;
    surname: string | null;
    phone: string | null;
    email: string | null;
    [key: string]: unknown;
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await requireDualAuth(request);
  if (auth instanceof Response) return auth;
  const supabaseClient = getDualAuthSupabase(auth);
  const user = getDualAuthUser(auth);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await parseRequestData(request);

  if (request.method === "POST") {
    const { ids, campaign_id, startOrder = 0, requeue = false } = data;
    const contactIds = ids.map((id: string | number) =>
      typeof id === "string" ? parseInt(id, 10) : id,
    );
    await enqueueContactsForCampaign(
      supabaseClient,
      Number(campaign_id),
      contactIds,
      { startOrder, requeue },
    );
    return routeData({ success: true });
  }
  if (request.method === "DELETE") {
    const { ids, campaign_id, filters } = data;
    const BATCH_SIZE = 100;

    if (ids) {
      const results = [];
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { data: deletedContacts, error } = await supabaseClient
          .from("campaign_queue")
          .delete()
          .eq("campaign_id", Number(campaign_id))
          .in("id", batch)
          .select();

        if (error) return routeData({ error: error.message }, { status: 500 });
        results.push(...(deletedContacts as CampaignQueue[]));
      }
      return routeData({ data: results });
    }

    const { data: contactsToDelete, error: lookupError } = await filteredSearch(
      "",
      filters,
      supabaseClient,
      ["id"],
      campaign_id,
    );
    if (lookupError) return routeData({ error: lookupError.message }, { status: 500 });

    const results = [];
    const contacts =
      (contactsToDelete as unknown as ContactMapping[] | null)?.map((item) => ({
        id: item.id,
        contact_id: item.contact_id,
        campaign_id: item.campaign_id,
        status: item.status,
        created_at: item.created_at,
        contact: item.contact,
      })) || [];

    const deleteIds = contacts
      .map((contact: unknown) => safeNumber((contact as { id: unknown }).id))
      .filter((id) => id > 0);

    for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
      const batch = deleteIds.slice(i, i + BATCH_SIZE);
      const { data: deletedContacts, error } = await supabaseClient
        .from("campaign_queue")
        .delete()
        .in("id", batch)
        .select();

      if (error) return routeData({ error: error.message }, { status: 500 });
      results.push(...(deletedContacts as CampaignQueue[]));
    }
    return routeData({ data: results });
  }
  return routeData({ error: "Method not allowed" }, { status: 405 });
};

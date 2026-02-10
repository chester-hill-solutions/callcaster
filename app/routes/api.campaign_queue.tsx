import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { parseRequestData } from "@/lib/database.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { verifyAuth } from "@/lib/supabase.server";
import { CampaignQueue } from "@/lib/types";
import { filteredSearch } from "./workspaces_.$id.campaigns.$selected_id.queue";
import { safeNumber } from "@/lib/type-utils";

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
    const { supabaseClient, user } = await verifyAuth(request);
    if (!user) throw redirect("/signin");
    const data = await parseRequestData(request);

    if (request.method === "POST") {
        const { ids, campaign_id, startOrder = 0, requeue = false } = data;
        const contactIds = ids.map((id: string | number) =>
            typeof id === "string" ? parseInt(id, 10) : id
        );
        await enqueueContactsForCampaign(
            supabaseClient,
            Number(campaign_id),
            contactIds,
            { startOrder, requeue }
        );
        return json({ success: true });
    }
    if (request.method === "DELETE") {
        const { ids, campaign_id, filters } = data;
        const BATCH_SIZE = 100;

        if (ids) {
            const results = [];
            // Delete in batches
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const batch = ids.slice(i, i + BATCH_SIZE);
                const { data: deletedContacts, error } = await supabaseClient
                    .from("campaign_queue")
                    .delete()
                    .eq('campaign_id', Number(campaign_id))
                    .in('id', batch)
                    .select();

                if (error) return json({ error: error.message }, { status: 500 });
                results.push(...(deletedContacts as CampaignQueue[]));
            }
            return json({ data: results });
        } else {
            const { data: contactsToDelete, error: lookupError } = await filteredSearch('', filters, supabaseClient, ['id'], campaign_id);
            if (lookupError) return json({ error: lookupError.message }, { status: 500 });

            const results = [];
            const contacts = (contactsToDelete as unknown as ContactMapping[] | null)?.map((item) => ({
              id: item.id,
              contact_id: item.contact_id,
              campaign_id: item.campaign_id,
              status: item.status,
              created_at: item.created_at,
              contact: item.contact
            })) || [];

            const ids = contacts.map((contact: unknown) => {
              if (contact && typeof contact === 'object' && 'id' in contact) {
                return safeNumber((contact as { id: unknown }).id);
              }
              return 0;
            }).filter(id => id > 0);

            // Delete in batches
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const batch = ids.slice(i, i + BATCH_SIZE);
                const { data: deletedContacts, error } = await supabaseClient
                    .from("campaign_queue")
                    .delete()
                    .in('id', batch)
                    .select();

                if (error) return json({ error: error.message }, { status: 500 });
                results.push(...(deletedContacts as CampaignQueue[]));
            }
            return json({ data: results });
        }
    }
    return json({ error: "Method not allowed" }, { status: 405 });
};
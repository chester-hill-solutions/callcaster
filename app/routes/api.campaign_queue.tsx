import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { parseRequestData } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { CampaignQueue } from "@/lib/types";
import { filteredSearch } from "./workspaces_.$id.campaigns.$selected_id.queue";
import { safeNumber, safeString } from "~/lib/type-utils";

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
        const BATCH_SIZE = 100;
        const results = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const batch = ids.slice(i, i + BATCH_SIZE);
            const { data: newContacts, error } = await supabaseClient
                .rpc('handle_campaign_queue_entry', batch.map((contactId: string, index: number) => ({
                    p_contact_id: contactId,
                    p_campaign_id: Number(campaign_id),
                    p_queue_order: startOrder + i + index,
                    p_requeue: requeue
                })))
                .select();
            if (error) throw error;
            results.push((newContacts as CampaignQueue[]));
        }

        return json({ data: results });
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

                if (error) throw error;
                results.push(...(deletedContacts as CampaignQueue[]));
            }
            return json({ data: results });
        } else {
            const { data: contactsToDelete, error: lookupError } = await filteredSearch('', filters, supabaseClient, ['id'], campaign_id);
            if (lookupError) throw lookupError;

            const results = [];
            const contacts = contactsToDelete?.map((item: ContactMapping) => ({
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

                if (error) throw error;
                results.push(...(deletedContacts as CampaignQueue[]));
            }
            return json({ data: results });
        }
    }
}
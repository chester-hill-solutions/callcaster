import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { PostgrestError } from "@supabase/supabase-js";
import { parseRequestData } from "~/lib/database.server";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignQueue } from "~/lib/types";
import { filteredSearch } from "./workspaces_.$id.campaigns.$selected_id.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
    if (!serverSession?.user) throw redirect("/signin");
    const data = await parseRequestData(request);

    if (request.method === "POST") {
        const { ids, campaign_id, startOrder = 0 } = data;
        const BATCH_SIZE = 100;
        const results = [];

        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const batch = ids.slice(i, i + BATCH_SIZE);
            const { data: newContacts, error } = await supabaseClient
                .from("campaign_queue")
                .insert(batch.map((id: string, index: number) => ({
                    contact_id: id,
                    campaign_id: Number(campaign_id),
                    queue_order: startOrder + i + index,
                    status: "queued"
                })))
                .select();

            if (error) throw error;
            results.push(...(newContacts as CampaignQueue[]));
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
            const ids = contactsToDelete.map((contact: any) => contact.id);

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
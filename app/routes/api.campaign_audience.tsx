import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { safeParseJson } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { logger } from "@/lib/logger.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { QUEUE_STATUS_QUEUED } from "@/lib/queue-status";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient, headers } = await verifyAuth(request);
    const method = request.method;

    try {
        if (method === "POST") {
            const { audience_id, campaign_id } = await safeParseJson(request);

            // First check if this audience is already added to the campaign
            const { data: existing, error: checkError } = await supabaseClient
                .from("campaign_audience")
                .select()
                .eq("campaign_id", campaign_id)
                .eq("audience_id", audience_id)
                .single();

            if (checkError && checkError.code !== "PGRST116") {
                throw checkError;
            }

            if (existing) {
                return json({ message: "Audience already added to campaign" }, { headers });
            }

            // Add the audience to the campaign
            const { error: addError } = await supabaseClient
                .from("campaign_audience")
                .insert({
                    campaign_id,
                    audience_id
                });

            if (addError) throw addError;

            // Get all contacts from this audience that aren't already in the queue
            const { data: contacts, error: contactsError } = await supabaseClient
                .from('contact_audience')
                .select('contact_id')
                .eq('audience_id', audience_id)
                .not('contact_id', 'in', (
                    supabaseClient
                        .from('campaign_queue')
                        .select('contact_id')
                        .eq('campaign_id', campaign_id)
                ));

            if (contactsError) throw contactsError;

            if (contacts && contacts.length > 0) {
                const contactIds = contacts.map((c) => c.contact_id);
                await enqueueContactsForCampaign(
                    supabaseClient,
                    campaign_id,
                    contactIds,
                    { requeue: false }
                );
            }

            return json({ success: true }, { headers });
        }

        if (method === "DELETE") {
            const { audience_id, campaign_id } = await safeParseJson(request);

            // Remove the audience from the campaign
            const { error } = await supabaseClient
                .from("campaign_audience")
                .delete()
                .eq("campaign_id", campaign_id)
                .eq("audience_id", audience_id);

            if (error) throw error;

            // Get all contacts that are only in this audience (not in other audiences of this campaign)
            const { data: campaignAudiences } = await supabaseClient
                .from('campaign_audience')
                .select('audience_id')
                .eq('campaign_id', campaign_id);

            const { data: contactsToRemove, error: contactsError } = await supabaseClient
                .from('contact_audience')
                .select('contact_id')
                .eq('audience_id', audience_id)
                .not('contact_id', 'in', (
                    supabaseClient
                        .from('contact_audience')
                        .select('contact_id')
                        .neq('audience_id', audience_id)
                        .in('audience_id', campaignAudiences?.map(a => a.audience_id) || [])
                ));

            if (contactsError) throw contactsError;

            if (contactsToRemove && contactsToRemove.length > 0) {
                // Remove these contacts from the queue if they haven't been called yet
                const { error: removeError } = await supabaseClient
                    .from('campaign_queue')
                    .delete()
                    .eq('campaign_id', campaign_id)
                    .in('contact_id', contactsToRemove.map(c => c.contact_id))
                    .eq('status', QUEUE_STATUS_QUEUED)
                    .eq('attempts', 0);

                if (removeError) throw removeError;
            }

            return json({ success: true }, { headers });
        }

        return json({ error: "Method not allowed" }, { status: 405, headers });
    } catch (error: unknown) {
        logger.error("Error in campaign_audience action:", error);
        return json(
            { error: error instanceof Error ? error.message : "An unexpected error occurred" },
            { status: 500, headers }
        );
    }
}; 
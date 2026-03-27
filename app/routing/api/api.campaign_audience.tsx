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
            const { audience_id, campaign_id } = await safeParseJson<{
                audience_id: string | number;
                campaign_id: string | number;
            }>(request);
            const audienceId = Number(audience_id);
            const campaignId = Number(campaign_id);
            if (!Number.isFinite(audienceId) || !Number.isFinite(campaignId)) {
                return json({ error: "Invalid audience_id or campaign_id" }, { status: 400, headers });
            }

            // First check if this audience is already added to the campaign
            const { data: existing, error: checkError } = await supabaseClient
                .from("campaign_audience")
                .select()
                .eq("campaign_id", campaignId)
                .eq("audience_id", audienceId)
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
                    campaign_id: campaignId,
                    audience_id: audienceId
                });

            if (addError) throw addError;

            const { data: audienceContacts, error: contactsError } = await supabaseClient
                .from('contact_audience')
                .select('contact_id')
                .eq('audience_id', audienceId);

            if (contactsError) throw contactsError;

            const audienceContactIds = (audienceContacts ?? []).map((contact) => contact.contact_id);

            if (audienceContactIds.length > 0) {
                const { data: existingQueueRows, error: queueError } = await supabaseClient
                    .from("campaign_queue")
                    .select("contact_id")
                    .eq("campaign_id", campaignId)
                    .in("contact_id", audienceContactIds);

                if (queueError) throw queueError;

                const existingContactIds = new Set(
                    (existingQueueRows ?? []).map((row) => row.contact_id),
                );
                const contactIds = audienceContactIds.filter(
                    (contactId) => !existingContactIds.has(contactId),
                );

                if (contactIds.length === 0) {
                    return json({ success: true }, { headers });
                }

                await enqueueContactsForCampaign(
                    supabaseClient,
                    campaignId,
                    contactIds,
                    { requeue: false }
                );
            }

            return json({ success: true }, { headers });
        }

        if (method === "DELETE") {
            const { audience_id, campaign_id } = await safeParseJson<{
                audience_id: string | number;
                campaign_id: string | number;
            }>(request);
            const audienceId = Number(audience_id);
            const campaignId = Number(campaign_id);
            if (!Number.isFinite(audienceId) || !Number.isFinite(campaignId)) {
                return json({ error: "Invalid audience_id or campaign_id" }, { status: 400, headers });
            }

            // Remove the audience from the campaign
            const { error } = await supabaseClient
                .from("campaign_audience")
                .delete()
                .eq("campaign_id", campaignId)
                .eq("audience_id", audienceId);

            if (error) throw error;

            // Get all contacts that are only in this audience (not in other audiences of this campaign)
            const { data: campaignAudiences } = await supabaseClient
                .from('campaign_audience')
                .select('audience_id')
                .eq('campaign_id', campaignId);

            const remainingAudienceIds = (campaignAudiences ?? []).map((audience) => audience.audience_id);

            const { data: removedAudienceContacts, error: removedAudienceContactsError } = await supabaseClient
                .from('contact_audience')
                .select('contact_id')
                .eq('audience_id', audienceId);

            if (removedAudienceContactsError) throw removedAudienceContactsError;

            let contactsToRemove = removedAudienceContacts ?? [];

            if (remainingAudienceIds.length > 0 && contactsToRemove.length > 0) {
                const { data: retainedContacts, error: retainedContactsError } = await supabaseClient
                    .from("contact_audience")
                    .select("contact_id")
                    .in("audience_id", remainingAudienceIds);

                if (retainedContactsError) throw retainedContactsError;

                const retainedContactIds = new Set(
                    (retainedContacts ?? []).map((contact) => contact.contact_id),
                );
                contactsToRemove = contactsToRemove.filter(
                    (contact) => !retainedContactIds.has(contact.contact_id),
                );
            }

            if (contactsToRemove && contactsToRemove.length > 0) {
                // Remove these contacts from the queue if they haven't been called yet
                const { error: removeError } = await supabaseClient
                    .from('campaign_queue')
                    .delete()
                    .eq('campaign_id', campaignId)
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
import {
    applyQueueStatusFilter,
    COMPLETED_QUEUE_COUNT_FILTER,
    QUEUE_STATUS_QUEUED,
    type QueueStatusFilter,
} from "@/lib/queue-status";
import { Audience, QueueItem, MessageCampaign, IVRCampaign, LiveCampaign, Campaign , Contact } from "@/lib/types";
import { data as routeData, redirect } from "react-router";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { parseActionRequest } from "@/lib/database.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import type { AppError } from "@/lib/errors.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {

    const { selected_id } = params;
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const page = Number(searchParams.get("page")) || 1;
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) throw redirect("/signin");
    if (!selected_id) throw redirect("../../");
    const { data: selectedAudiences, error: selectedAudienceError } = await supabaseClient
        .from('campaign_audience')
        .select('audience_id')
        .eq('campaign_id', parseInt(selected_id));
    if (selectedAudienceError) throw selectedAudienceError;
    const selectedAudienceIds = selectedAudiences.map((aud) => aud.audience_id) || [];
    const filters = {
        name: searchParams.get("name") || "",
        phone: searchParams.get("phone") || "",
        disposition: searchParams.get("disposition") || "",
        queueStatus: searchParams.get("queueStatus") || "",
        audiences: searchParams.get("audiences") || "",
        email: searchParams.get("email") || "",
        address: searchParams.get("address") || ""
    };

    const selectFields = [
        '*',
        `contact!left(
            *,
            outreach_attempt!left(id, disposition, campaign_id),
            contact_audience!left(...audience!left(name))
        )`
    ];

    const [queueData, unfilteredCount, queuedCount] = await Promise.all([
        filteredSearch("", filters, supabaseClient, selectFields, selected_id)
            .range(offset, offset + pageSize - 1)
            .then(({ data, error, count }) => ({ data, error, count })),
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .then(({ count, error }) => ({ count, error })),
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .eq('status', QUEUE_STATUS_QUEUED)
            .then(({ count, error }) => ({ count, error })),
    ]);

    const queueResponse: QueueResponse = {
        queueData: queueData.data as (QueueItem & { contact: Contact; audiences: Audience[] })[] | null,
        queueError: queueData.error || null,
        totalCount: queueData.count,
        queuedCount: queuedCount.count,
        unfilteredCount: unfilteredCount.count,
        currentPage: page,
        pageSize,
        filters: { ...filters }
    };

    return routeData({
        selectedAudienceIds,
        queuePromise: queueResponse,
        campaignId: selected_id
    });
}

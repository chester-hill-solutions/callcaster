import type { AppError } from "@/lib/errors.server";
import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect, Await, useFetcher, useLoaderData, useOutletContext, useRouteError, useSearchParams } from "react-router";
import { Audience, QueueItem, MessageCampaign, IVRCampaign, LiveCampaign, Campaign , Contact } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import {
    applyQueueStatusFilter,
    COMPLETED_QUEUE_COUNT_FILTER,
    QUEUE_STATUS_QUEUED,
    type QueueStatusFilter,
} from "@/lib/queue-status";
import { data as routeData, redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { parseActionRequest } from "@/lib/database.server";
import { enqueueContactsForCampaign } from "@/lib/queue.server";
import { verifyAuth } from "@/lib/supabase.server";

function useQueueActions(campaignId: string, unfilteredCount: number) {
    const fetcher = useFetcher();
    const [params, setParams] = useSearchParams();

    const handleFilterChange = (key: string, value: string) => {
        setParams((prev) => {
            const newParams = new URLSearchParams(prev);
            if (value) {
                newParams.set(key, value);
            } else {
                newParams.delete(key);
            }
            return newParams;
        });
    };

    const clearFilter = () => {
        setParams((prev) => {
            const newParams = new URLSearchParams(prev);
            ['name', 'phone', 'disposition', 'queueStatus', 'audiences', 'email', 'address'].forEach(key => {
                newParams.delete(key);
            });
            return newParams;
        });
    };

    const handleStatusChange = (ids: string[], newStatus: string, isAllSelected: boolean) => {
        const filters = Object.fromEntries(params.entries());
        fetcher.submit(
            {
                intent: "update_status",
                ids: isAllSelected ? 'all' : ids,
                status: newStatus,
                isAllSelected,
                filters: JSON.stringify(filters),
            },
            { method: "POST", encType: "application/json" }
        );
    };

    const handleAddFromAudience = (audienceId: number) => {
        fetcher.submit(
            { audience_id: audienceId, campaign_id: Number(campaignId) },
            { action: "/api/campaign_audience", method: "POST", encType: "application/json" }
        );
    };

    const handleAddContactToQueue = (contacts: Contact[]) => {
        fetcher.submit(
            {
                ids: contacts.map(c => c.id),
                campaign_id: Number(campaignId),
                startOrder: unfilteredCount
            },
            { action: "/api/campaign_queue", method: "POST", encType: "application/json" }
        );
    };

    const handleRemoveContactsFromQueue = (ids: string[] | 'all') => {
        const filters = Object.fromEntries(params.entries());
        fetcher.submit(
            ids === 'all'
                ? { campaign_id: Number(campaignId), filters }
                : { ids, campaign_id: Number(campaignId) },
            { method: "DELETE", encType: "application/json", action: "/api/campaign_queue" }
        );
    };

    return {
        handleFilterChange,
        clearFilter,
        handleStatusChange,
        handleAddFromAudience,
        handleAddContactToQueue,
        handleRemoveContactsFromQueue,
        queueFetcher: fetcher,
    };
}

export const action = async ({ request, params }: ActionFunctionArgs) => {



    const { selected_id } = params;
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) throw redirect("/signin");
    if (!selected_id) throw redirect("../../");

    const data = await parseActionRequest(request);
    const intent = data.intent as string;

    if (intent === "update_status") {
        const ids = data.ids;
        const newStatus = data.status as string;
        const isAllSelected = data.isAllSelected === true || data.isAllSelected === "true";
        const filters = typeof data.filters === "string"
            ? JSON.parse(data.filters)
            : (data.filters as QueueResponse["filters"] | undefined);

        if (isAllSelected) {
            const filteredIdsQuery = filteredSearch(
                "",
                filters || {
                    name: "",
                    phone: "",
                    email: "",
                    address: "",
                    audiences: "",
                    disposition: "",
                    queueStatus: "",
                },
                supabaseClient,
                ["id"],
                selected_id,
            );
            const { data: filteredRows, error: filteredRowsError } = await filteredIdsQuery;

            if (filteredRowsError) {
                return routeData({ success: false, error: filteredRowsError.message });
            }

            const filteredIds = ((filteredRows ?? []) as unknown as Array<{ id: number | string }>)
                .map((row) => {
                    const id = row?.id ?? null;
                    return typeof id === "number" ? id : Number(id);
                })
                .filter((id): id is number => Number.isFinite(id));

            if (filteredIds.length === 0) {
                return routeData({ success: true });
            }

            const { error } = await supabaseClient
                .from("campaign_queue")
                .update({ status: newStatus })
                .in("id", filteredIds);

            if (error) {
                return routeData({ success: false, error: error.message });
            }
        } else {
            const updateIds = (Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))).map(
                (item: string | { id: string }) => (typeof item === "object" ? item.id : item)
            );
            
            if (updateIds.length > 0) {
                const { error } = await supabaseClient
                    .from("campaign_queue")
                    .update({ status: newStatus })
                    .in("id", updateIds);

                if (error) {
                    return routeData({ success: false, error: error.message });
                }
            }
        }

        return routeData({ success: true });
    }

    if (intent === "add_from_audience") {
        const audienceId = parseInt(String(data.audienceId ?? ""));
        const { data: contacts, error } = await supabaseClient
            .from("contact_audience")
            .select("contact_id")
            .eq("audience_id", audienceId);

        if (error) {
            return routeData({ success: false, error: error.message });
        }

        const contactIds = contacts.map((contact) => contact.contact_id);
        await enqueueContactsForCampaign(
            supabaseClient,
            parseInt(selected_id),
            contactIds,
            { requeue: false }
        );

        return routeData({ success: true });
    }

    if (intent === "add_contacts") {
        const contacts = (typeof data.contacts === "string" ? JSON.parse(data.contacts) : data.contacts) as Contact[];
        await enqueueContactsForCampaign(
            supabaseClient,
            parseInt(selected_id),
            contacts.map((contact) => contact.id),
            { requeue: false }
        );

        return routeData({ success: true });
    }

    if (intent === "remove_contacts") {
        const ids = data.ids;
        const isAllSelected = data.isAllSelected === true || data.isAllSelected === "true";

        if (isAllSelected) {
            const { error } = await supabaseClient
                .from("campaign_queue")
                .delete()
                .eq("campaign_id", parseInt(selected_id));

            if (error) {
                return routeData({ success: false, error: error.message });
            }
        } else {
            const removeIds = (Array.isArray(ids) ? ids : JSON.parse(String(ids ?? "[]"))).map(
                (item: string | { id: string }) => (typeof item === "object" ? item.id : item)
            );
            
            if (removeIds.length > 0) {
                const { error } = await supabaseClient
                    .from("campaign_queue")
                    .delete()
                    .in("id", removeIds);

                if (error) {
                    return routeData({ success: false, error: error.message });
                }
            }
        }

        return routeData({ success: true });
    }

    return routeData({ success: false, error: "Invalid intent" });
}

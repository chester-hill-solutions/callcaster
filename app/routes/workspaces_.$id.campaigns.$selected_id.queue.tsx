import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Await, useFetcher, useLoaderData, useOutletContext, useRouteError, useSearchParams } from "@remix-run/react";
import { Suspense, useState, type Dispatch, type SetStateAction } from "react";
import { parseActionRequest } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Audience, QueueItem, MessageCampaign, IVRCampaign, LiveCampaign, Campaign , Contact } from "@/lib/types";
import { QueueContent } from "@/components/queue/QueueContent";
import { SupabaseClient } from "@supabase/supabase-js";
import { ContactSearchDialog } from "@/components/queue/ContactSearchDialog";
import type { AppError } from "@/lib/errors.server";
import {
    applyQueueStatusFilter,
    COMPLETED_QUEUE_COUNT_FILTER,
    QUEUE_STATUS_QUEUED,
    type QueueStatusFilter,
} from "@/lib/queue-status";
import { enqueueContactsForCampaign } from "@/lib/queue.server";

interface QueueResponse {
    queueData: (QueueItem & { contact: Contact; audiences: Audience[] })[] | null;
    queueError: AppError | Error | null;
    totalCount: number | null;
    unfilteredCount: number | null;
    queuedCount: number | null;
    currentPage: number;
    pageSize: number;
    filters: {
        name: string;
        phone: string;
        email: string;
        address: string;
        audiences: string;
        disposition: string;
        queueStatus: string;
    }
}

interface LoaderData {
    queuePromise: Promise<QueueResponse>;
    selectedAudienceIds: number[];
    campaignId: string;
}

export const filteredSearch = (query: string, filters: { name: string, phone: string, email: string, address: string, audiences: string, disposition: string, queueStatus: string }, supabaseClient: SupabaseClient, returnFields: string[] | null = null, campaignId: string) => {
    let searchQuery = supabaseClient.from("campaign_queue").select(returnFields ? returnFields.join(',') : '*', { count: 'exact' }).eq('campaign_id', Number(campaignId));
    if (query) {
        searchQuery = searchQuery.or(`firstname.ilike.%${query}%,surname.ilike.%${query}%`, { foreignTable: 'contact' });
    }
    if (filters.name) {
        searchQuery = searchQuery.or(`firstname.ilike.%${filters.name}%,surname.ilike.%${filters.name}%`, { foreignTable: 'contact' });
    }
    if (filters.phone) {
        searchQuery = searchQuery.ilike('contact.phone', `%${filters.phone}%`);
    }
    if (filters.disposition) {
        if (filters.disposition === 'unknown') {
            searchQuery = searchQuery.is('contact.outreach_attempt.disposition', null);
        } else {
            searchQuery = searchQuery.eq('contact.outreach_attempt.disposition', filters.disposition);
        }
    }
    if (filters.queueStatus) {
        const queueStatus = filters.queueStatus as QueueStatusFilter;
        searchQuery = applyQueueStatusFilter(searchQuery, queueStatus);
    }
    if (filters.audiences) {
        const audienceId = Number(filters.audiences);
        searchQuery = searchQuery.in('contact.contact_audience.audience_id', [audienceId]);
    }
    if (filters.email) {
        searchQuery = searchQuery.ilike('contact.email', `%${filters.email}%`);
    }
    if (filters.address) {
        searchQuery = searchQuery.ilike('contact.address', `%${filters.address}%`);
    }
    return searchQuery;
}

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

    return defer({
        selectedAudienceIds,
        queuePromise: queueResponse,
        campaignId: selected_id
    });
};

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
                return json({ success: false, error: filteredRowsError.message });
            }

            const filteredIds = ((filteredRows ?? []) as unknown as Array<{ id: number | string }>)
                .map((row) => {
                    const id = row?.id ?? null;
                    return typeof id === "number" ? id : Number(id);
                })
                .filter((id): id is number => Number.isFinite(id));

            if (filteredIds.length === 0) {
                return json({ success: true });
            }

            const { error } = await supabaseClient
                .from("campaign_queue")
                .update({ status: newStatus })
                .in("id", filteredIds);

            if (error) {
                return json({ success: false, error: error.message });
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
                    return json({ success: false, error: error.message });
                }
            }
        }

        return json({ success: true });
    }

    if (intent === "add_from_audience") {
        const audienceId = parseInt(String(data.audienceId ?? ""));
        const { data: contacts, error } = await supabaseClient
            .from("contact_audience")
            .select("contact_id")
            .eq("audience_id", audienceId);

        if (error) {
            return json({ success: false, error: error.message });
        }

        const contactIds = contacts.map((contact) => contact.contact_id);
        await enqueueContactsForCampaign(
            supabaseClient,
            parseInt(selected_id),
            contactIds,
            { requeue: false }
        );

        return json({ success: true });
    }

    if (intent === "add_contacts") {
        const contacts = (typeof data.contacts === "string" ? JSON.parse(data.contacts) : data.contacts) as Contact[];
        await enqueueContactsForCampaign(
            supabaseClient,
            parseInt(selected_id),
            contacts.map((contact) => contact.id),
            { requeue: false }
        );

        return json({ success: true });
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
                return json({ success: false, error: error.message });
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
                    return json({ success: false, error: error.message });
                }
            }
        }

        return json({ success: true });
    }

    return json({ success: false, error: "Invalid intent" });
};


export function ErrorBoundary() {
    const error = useRouteError() as { message?: string };
    return (
        <div className="flex flex-col items-center justify-center p-8">
            <h2 className="text-xl font-semibold mb-4">Error Loading Queue</h2>
            <p className="text-gray-600 mb-4">There was a problem loading the queue data. Please try again.</p>
            <div>{error?.message || "An unknown error occurred"}</div>
            <Button onClick={() => window.location.reload()}>
                Retry
            </Button>
        </div>
    );
}

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

function QueueResolvedContent({
    queueValue,
    campaignId,
    selectedAudienceIds,
    audiences,
    supabase,
    campaignWorkspace,
    isSelectingAudience,
    selectedAudience,
    setIsSelectingAudience,
    setSelectedAudience,
    isAllFilteredSelected,
    setIsAllFilteredSelected,
    searchModalOpen,
    setSearchModalOpen,
}: {
    queueValue: QueueResponse;
    campaignId: string;
    selectedAudienceIds: number[];
    audiences: NonNullable<Audience>[];
    supabase: SupabaseClient;
    campaignWorkspace: string;
    isSelectingAudience: boolean;
    selectedAudience: number | null;
    setIsSelectingAudience: Dispatch<SetStateAction<boolean>>;
    setSelectedAudience: Dispatch<SetStateAction<number | null>>;
    isAllFilteredSelected: boolean;
    setIsAllFilteredSelected: Dispatch<SetStateAction<boolean>>;
    searchModalOpen: boolean;
    setSearchModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
    const queueActions = useQueueActions(campaignId, queueValue.unfilteredCount ?? 0);
    const queueContentValue = {
        ...queueValue,
        queueError: queueValue.queueError || null,
    } as QueueResponse;

    return (
        <>
            <ContactSearchDialog
                open={searchModalOpen}
                onOpenChange={setSearchModalOpen}
                campaignId={campaignId}
                workspaceId={campaignWorkspace}
                unfilteredCount={queueValue.unfilteredCount ?? 0}
                onAddToQueue={queueActions.handleAddContactToQueue}
            />
            <QueueContent
                queueValue={queueContentValue}
                audiences={audiences}
                isSelectingAudience={isSelectingAudience}
                selectedAudience={selectedAudience}
                setIsSelectingAudience={setIsSelectingAudience}
                setSelectedAudience={setSelectedAudience}
                handleAddFromAudience={queueActions.handleAddFromAudience}
                handleAddContact={() => setSearchModalOpen(true)}
                onStatusChange={(ids, status) => queueActions.handleStatusChange(ids, status, isAllFilteredSelected)}
                isAllFilteredSelected={isAllFilteredSelected}
                setIsAllFilteredSelected={setIsAllFilteredSelected}
                selectedAudienceIds={selectedAudienceIds}
                campaignId={campaignId}
                supabase={supabase}
                handleFilterChange={queueActions.handleFilterChange}
                clearFilter={queueActions.clearFilter}
                addContactToQueue={queueActions.handleAddContactToQueue}
                removeContactsFromQueue={queueActions.handleRemoveContactsFromQueue}
                queueFetcher={queueActions.queueFetcher}
            />
        </>
    );
}

export default function Queue() {
    const { campaignData, campaignDetails, audiences, supabase } = useOutletContext<{
        campaignData: NonNullable<Campaign> & { workspace: string },
        campaignDetails: IVRCampaign | MessageCampaign | LiveCampaign,
        audiences: NonNullable<Audience>[],
        supabase: SupabaseClient
    }>();
    const { queuePromise, campaignId, selectedAudienceIds } = useLoaderData<typeof loader>();
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const [isSelectingAudience, setIsSelectingAudience] = useState(false);
    const [selectedAudience, setSelectedAudience] = useState<number | null>(null);
    const [searchModalOpen, setSearchModalOpen] = useState(false);

    return (
        <Suspense fallback={<div className="flex justify-center items-center p-8"><Spinner className="h-8 w-8" /></div>}>
            <Await resolve={queuePromise}>
                {(queueValue) => {
                    return (
                        <QueueResolvedContent
                            queueValue={queueValue as QueueResponse}
                            campaignId={campaignId}
                            selectedAudienceIds={selectedAudienceIds}
                            audiences={audiences}
                            supabase={supabase}
                            campaignWorkspace={campaignData.workspace}
                            isSelectingAudience={isSelectingAudience}
                            selectedAudience={selectedAudience}
                            setIsSelectingAudience={setIsSelectingAudience}
                            setSelectedAudience={setSelectedAudience}
                            isAllFilteredSelected={isAllFilteredSelected}
                            setIsAllFilteredSelected={setIsAllFilteredSelected}
                            searchModalOpen={searchModalOpen}
                            setSearchModalOpen={setSearchModalOpen}
                        />
                    );
                }}
            </Await>
        </Suspense>
    );
} 

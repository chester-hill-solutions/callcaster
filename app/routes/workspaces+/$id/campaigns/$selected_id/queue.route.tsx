export { loader } from "./queue.loader.server";
export { action } from "./queue.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect, Await, useFetcher, useLoaderData, useOutletContext, useRouteError, useSearchParams } from "react-router";
import { Suspense, useState, type Dispatch, type SetStateAction } from "react";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";


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

    useActionFeedback(queueActions.queueFetcher.data, {
        enabled: queueActions.queueFetcher.state === "idle",
        getWarning: (data) =>
            data && typeof data === "object" && "warning" in data
                ? (data as { warning?: string }).warning
                : undefined,
        getSuccess: (data) =>
            Boolean(
                data &&
                    typeof data === "object" &&
                    "success" in data &&
                    (data as { success?: boolean }).success &&
                    typeof (data as { enqueued?: number }).enqueued === "number" &&
                    ((data as { enqueued?: number }).enqueued ?? 0) > 0,
            ),
        successMessage: (data) =>
            `Added ${(data as { enqueued?: number }).enqueued} contacts to the queue`,
    });

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
    const { queuePromise, campaignId, selectedAudienceIds } = useLoaderData<LoaderData>();
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

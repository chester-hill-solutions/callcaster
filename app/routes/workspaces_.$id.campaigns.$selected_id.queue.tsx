import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Await, useFetcher, useLoaderData, useOutletContext, useRouteError, useSearchParams } from "@remix-run/react";
import { Suspense, useState } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Audience, QueueItem, MessageCampaign, IVRCampaign, LiveCampaign, Campaign } from "@/lib/types";
import { Contact } from "@/lib/types";
import { QueueContent } from "@/components/queue/QueueContent";
import { SupabaseClient } from "@supabase/supabase-js";
<<<<<<< HEAD
import { ContactSearchDialog } from "@/components/queue/ContactSearchDialog";
=======
import { ContactSearchDialog } from "~/components/queue/ContactSearchDialog";
import { AppError } from "~/lib/types";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

interface QueueResponse {
    queueData: (QueueItem & { contact: Contact; audiences: Audience[] })[] | null;
    queueError: AppError | null;
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
        status: string;
    }
}

interface LoaderData {
    queuePromise: Promise<QueueResponse>;
    selectedAudienceIds: number[];
    campaignId: string;
}

export const filteredSearch = (query: string, filters: { name: string, phone: string, email: string, address: string, audiences: string, status: string }, supabaseClient: SupabaseClient, returnFields: string[] | null = null, campaignId: string) => {
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
    if (filters.status) {
        if (filters.status === 'unknown') {
            searchQuery = searchQuery.is('contact.outreach_attempt.disposition', null);
        } else {
            searchQuery = searchQuery.eq('contact.outreach_attempt.disposition', filters.status);
        }
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
        status: searchParams.get("status") || "",
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

    const [queueData, unfilteredCount, totalCount, queuedCount] = await Promise.all([
        filteredSearch("", filters, supabaseClient, selectFields, selected_id)
            .eq('contact.outreach_attempt.campaign_id', selected_id)
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
            .then(({ count, error }) => ({ count, error })),
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .eq('status', 'queued')
            .then(({ count, error }) => ({ count, error })),
    ]);

    const queueResponse: QueueResponse = {
        queueData: queueData.data as (QueueItem & { contact: Contact; audiences: Audience[] })[] | null,
        queueError: queueData.error || null,
        totalCount: totalCount.count,
        queuedCount: queuedCount.count,
        unfilteredCount: unfilteredCount.count,
        currentPage: page,
        pageSize,
        filters
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

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent === "update_status") {
        const ids = formData.get("ids") as string;
        const newStatus = formData.get("status") as string;
        const isAllSelected = formData.get("isAllSelected") === "true";

        if (isAllSelected) {
            const { error } = await supabaseClient
                .from("campaign_queue")
                .update({ status: newStatus })
                .eq("campaign_id", parseInt(selected_id));

            if (error) {
                return json({ success: false, error: error.message });
            }
        } else {
            const updateIds = JSON.parse(ids).map((item: { id: string }) => item.id) || [];
            
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
        const audienceId = parseInt(formData.get("audienceId") as string);
        const { data: contacts, error } = await supabaseClient
            .from("contact_audience")
            .select("contact_id")
            .eq("audience_id", audienceId);

        if (error) {
            return json({ success: false, error: error.message });
        }

        const contactIds = contacts.map((contact) => contact.contact_id);
        const queueItems = contactIds.map((contactId) => ({
            campaign_id: parseInt(selected_id),
            contact_id: contactId,
            status: "queued",
        }));

        const { error: insertError } = await supabaseClient
            .from("campaign_queue")
            .insert(queueItems);

        if (insertError) {
            return json({ success: false, error: insertError.message });
        }

        return json({ success: true });
    }

    if (intent === "add_contacts") {
        const contacts = JSON.parse(formData.get("contacts") as string) as Contact[];
        const queueItems = contacts.map((contact) => ({
            campaign_id: parseInt(selected_id),
            contact_id: contact.id,
            status: "queued",
        }));

        const { error } = await supabaseClient
            .from("campaign_queue")
            .insert(queueItems);

        if (error) {
            return json({ success: false, error: error.message });
        }

        return json({ success: true });
    }

    if (intent === "remove_contacts") {
        const ids = formData.get("ids") as string;
        const isAllSelected = formData.get("isAllSelected") === "true";

        if (isAllSelected) {
            const { error } = await supabaseClient
                .from("campaign_queue")
                .delete()
                .eq("campaign_id", parseInt(selected_id));

            if (error) {
                return json({ success: false, error: error.message });
            }
        } else {
            const removeIds = JSON.parse(ids).map((item: { id: string }) => item.id) || [];
            
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
            ['name', 'phone', 'status', 'audiences', 'email', 'address'].forEach(key => {
                newParams.delete(key);
            });
            return newParams;
        });
    };

    const handleStatusChange = (ids: string[], newStatus: string, isAllSelected: boolean) => {
        fetcher.submit(
            { ids: isAllSelected ? 'all' : ids, newStatus },
            { method: "POST", encType: "application/json" }
        );
    };

    const handleAddFromAudience = (audienceId: number) => {
        fetcher.submit(
            { audience_id: audienceId, campaign_id: Number(campaignId) },
            { action: "/api/campaign_audience", method: "POST", encType: "application/json", navigate: false }
        );
    };

    const handleAddContactToQueue = (contacts: Contact[]) => {
        fetcher.submit(
            {
                ids: contacts.map(c => c.id),
                campaign_id: Number(campaignId),
                startOrder: unfilteredCount
            },
            { action: "/api/campaign_queue", method: "POST", encType: "application/json", navigate: false }
        );
    };

    const handleRemoveContactsFromQueue = (ids: string[] | 'all') => {
        const filters = Object.fromEntries(params.entries());
        fetcher.submit(
            ids === 'all'
                ? { campaign_id: Number(campaignId), filters }
                : { ids, campaign_id: Number(campaignId) },
            { method: "DELETE", encType: "application/json", navigate: false, action: "/api/campaign_queue" }
        );
    };

    return {
        handleFilterChange,
        clearFilter,
        handleStatusChange,
        handleAddFromAudience,
        handleAddContactToQueue,
        handleRemoveContactsFromQueue
    };
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
                    const queueActions = useQueueActions(campaignId, queueValue.unfilteredCount ?? 0);
                    const queueContentValue = {
                        ...queueValue,
                        queueError: queueValue.queueError || null
                    } as QueueResponse;

                    return (
                        <>
                            <ContactSearchDialog
                                open={searchModalOpen}
                                onOpenChange={setSearchModalOpen}
                                campaignId={campaignId}
                                workspaceId={campaignData.workspace}
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
                                supabase={supabase}
                                handleFilterChange={queueActions.handleFilterChange}
                                clearFilter={queueActions.clearFilter}
                                addContactToQueue={queueActions.handleAddContactToQueue}
                                removeContactsFromQueue={queueActions.handleRemoveContactsFromQueue}
                            />
                        </>
                    );
                }}
            </Await>
        </Suspense>
    );
} 

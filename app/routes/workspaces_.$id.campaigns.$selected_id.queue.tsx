import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Await, useFetcher, useLoaderData, useOutletContext, useRouteError, useSearchParams } from "@remix-run/react";
import { Suspense, useState } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Spinner } from "~/components/ui/spinner";
import { Button } from "~/components/ui/button";
import { CampaignAudience, Audience, QueueItem, MessageCampaign, IVRCampaign, LiveCampaign } from "~/lib/types";
import { Contact } from "~/lib/types";
import { DialogTitle } from "~/components/ui/dialog";
import { Dialog, DialogHeader } from "~/components/ui/dialog";
import { DialogContent } from "~/components/ui/dialog";
import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import { QueueContent } from "~/components/queue/QueueContent";
import { SupabaseClient } from "@supabase/supabase-js";
import { CampaignSettingsData } from "~/hooks/useCampaignSettings";

interface QueueResponse {
    queueData: (QueueItem & { contact: Contact; audiences: Audience[] })[] | null;
    queueError: any;
    totalCount: number | null;
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

    const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);

    if (!serverSession?.user) return redirect("/signin");
    if (!selected_id) return redirect("../../");

    const filters = {
        name: searchParams.get("name") || "",
        phone: searchParams.get("phone") || "",
        status: searchParams.get("status") || "",
        audiences: searchParams.get("audiences") || "",
        email: searchParams.get("email") || "",
        address: searchParams.get("address") || ""
    };

    const sortParam = searchParams.get("sort");

    // Run queries in parallel
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
        // Unfiltered count query  
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .then(({ count, error }) => ({ count, error })),
        // Total count query
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .then(({ count, error }) => ({ count, error })),
        // Queued count query
        supabaseClient
            .from("campaign_queue")
            .select('id', { count: 'exact' })
            .eq('campaign_id', Number(selected_id))
            .eq('status', 'queued')
            .then(({ count, error }) => ({ count, error })),
    ]);

    return defer({
        queuePromise: Promise.resolve({
            queueData: queueData.data,
            queueError: queueData.error,
            totalCount: totalCount.count,
            queuedCount: queuedCount.count,
            unfilteredCount: unfilteredCount.count,
            currentPage: page,
            pageSize,
            filters,
            sortParam
        }),
        campaignId: selected_id
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
    const { id: workspace_id, selected_id } = params;

    if (!serverSession?.user) throw redirect("/signin");

    if (!selected_id) throw redirect("../../");

    if (request.method === "POST") {
        const { ids, newStatus } = await request.json();
        const url = new URL(request.url);
        const searchParams = url.searchParams;
        const nameFilter = searchParams.get("name") || "";
        const phoneFilter = searchParams.get("phone") || "";
        const statusFilter = searchParams.get("status") || "";
        const audiencesFilter = searchParams.get("audiences") || "";
        const emailFilter = searchParams.get("email") || "";
        const addressFilter = searchParams.get("address") || "";
        if (!ids || !newStatus) throw new Error("Missing ids or newStatus");
        let updateIds = ids;
        if (ids === 'all') {
            updateIds = [];
        }

        let updateQuery = supabaseClient
            .from("campaign_queue")
            .update({ status: newStatus })
            .eq('campaign_id', Number(selected_id));

        if (ids === 'all') {
            let searchQuery = filteredSearch(nameFilter, {
                name: nameFilter,
                phone: phoneFilter,
                status: statusFilter,
                audiences: audiencesFilter,
                email: emailFilter,
                address: addressFilter
            }, supabaseClient, ['id', 'contact!inner(*)'], selected_id);
            const { data: ids, error: searchError } = await searchQuery;
            if (searchError) return json({ error: searchError.message });
            updateIds = ids?.map((item: any) => item.id) || [];
            updateQuery = updateQuery.in('id', updateIds);
        } else {
            updateQuery = updateQuery.in('id', ids);
        }

        const { error } = await updateQuery;

        if (error) {
            throw new Error(error.message);
        }
    }
    return { success: true };
};


export function ErrorBoundary() {
    const error = useRouteError();
    return (
        <div className="flex flex-col items-center justify-center p-8">
            <h2 className="text-xl font-semibold mb-4">Error Loading Queue</h2>
            <p className="text-gray-600 mb-4">There was a problem loading the queue data. Please try again.</p>
            <div>{error.message || "An unknown error occurred"}</div>
            <Button onClick={() => window.location.reload()}>
                Retry
            </Button>
        </div>
    );
}

export default function Queue() {
    const { campaignData, campaignDetails, audiences, supabase } = useOutletContext<{ campaignData: CampaignSettingsData, campaignDetails: IVRCampaign | MessageCampaign | LiveCampaign, audiences: Audience[], supabase: SupabaseClient }>();
    const { queuePromise, campaignId } = useLoaderData<typeof loader>();
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const [isSelectingAudience, setIsSelectingAudience] = useState(false);
    const [selectedAudience, setSelectedAudience] = useState<number | null>(null);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState("");

    const fetcher = useFetcher();
    const contactFetcher = useFetcher<{ contacts: (Contact & { contact_audience: { audience_id: number }[], queued: boolean })[] }>({ key: 'contact-search' });

    const handleNameChange = (value: string) => {
        setSearchParams((prev) => ({ ...prev, name: value }));
    }
    const clearFilter = () => {

        setSearchParams(prev => {
            prev.delete('name');
            prev.delete('phone');
            prev.delete('status');
            prev.delete('audiences');
            prev.delete('email');
            prev.delete('address');
            prev.delete('status');
            return prev;
        });
    }


    const onStatusChange = async (ids: string[], newStatus: string) => {
        const queueData = {
            ids: isAllFilteredSelected ? 'all' : ids,
            newStatus,
        };
        fetcher.submit(queueData, { method: "POST", encType: "application/json" });
    };

    const handleAddFromAudience = (value: number) => {
        fetcher.submit({ audience_id: value, campaign_id: Number(campaignId) }, { action: "/api/campaign_audience", method: "POST", encType: "application/json", navigate: false });
    }

    const handleAddContact = () => {
        setSearchModalOpen(true);
    }
    const handleSearch = (query: string) => {
        contactFetcher.load(`/api/contacts?q=${query}&workspace_id=${campaignData.workspace}&campaign_id=${campaignId}`);
    }

    const handleAddContactToQueue = (contacts: (Contact & { contact_audience: { audience_id: number }[] })[], unfilteredCount: number) => {
        fetcher.submit(
            { ids: contacts.map((contact) => contact.id), campaign_id: Number(campaignId), startOrder: unfilteredCount },
            { action: "/api/campaign_queue", method: "POST", encType: "application/json", navigate: false }
        );
    }

    const handleRemoveContactsFromQueue = (ids: string[] | 'all') => {
        if (ids === 'all') {
            fetcher.submit({ campaign_id: Number(campaignId), filters: Object.fromEntries(searchParams.entries()) }, { method: "DELETE", encType: "application/json", navigate: false, action: "/api/campaign_queue" });
        } else {
            fetcher.submit({ ids, campaign_id: Number(campaignId) }, { method: "DELETE", encType: "application/json", navigate: false, action: "/api/campaign_queue" });
        }
    }

    const selectedCampaignAudienceIds = campaignData.campaign_audience?.map((audience: CampaignAudience) => audience?.audience_id).filter((id: number): id is number => id !== null);

    const handleFilterChange = (key: string, value: string) => {
        setSearchParams(prev => {
            if (value) {
                prev.set(key, value);
            } else {
                prev.delete(key);
            }
            return prev;
        });
    };

    return (
        <Suspense fallback={
            <div className="flex justify-center items-center p-8">
                <Spinner className="h-8 w-8" />
            </div>
        }>
            <Await resolve={queuePromise}>
                {(queueValue) => (
                    <>
                        <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
                            <DialogContent className="bg-white">
                                <DialogHeader>
                                    <DialogTitle>Search Contacts</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Search by name or phone..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)} />
                                        <Button size="icon" onClick={() => handleSearch(searchQuery)}>
                                            <Search className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="min-h-[200px]">
                                        {contactFetcher.data?.contacts?.length ? (
                                            <div className="space-y-2">
                                                {contactFetcher.data.contacts.map((contact) => contact && (
                                                    <div
                                                        key={contact.id}
                                                        className="grid grid-cols-[2fr,2fr,2fr,1fr] gap-2 p-2 border rounded-md hover:bg-gray-50 transition-colors text-sm"
                                                    >
                                                        <div className="truncate">
                                                            {contact.firstname} {contact.surname}
                                                        </div>
                                                        <div className="truncate text-gray-600">
                                                            {contact.phone && <div>{contact.phone}</div>}
                                                            {contact.email && <div>{contact.email}</div>}
                                                        </div>
                                                        <div className="truncate text-gray-600">

                                                            {contact.address}
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs w-full ${contact.queued ? "bg-green-500/20 border-green-500/60 hover:bg-green-500/30" : ""}`}
                                                            disabled={contact.queued}
                                                            onClick={() => handleAddContactToQueue([contact], queueValue.unfilteredCount ?? 0)}
                                                        >
                                                            {contact.queued ? "Added" : "Add"}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-500 py-4">
                                                No results found
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                        <QueueContent
                            queueValue={queueValue as QueueResponse}
                            handleFilterChange={handleFilterChange}
                            clearFilter={clearFilter}
                            audiences={audiences}
                            selectedCampaignAudienceIds={selectedCampaignAudienceIds}
                            isSelectingAudience={isSelectingAudience}
                            selectedAudience={selectedAudience}
                            setIsSelectingAudience={setIsSelectingAudience}
                            setSelectedAudience={setSelectedAudience}
                            handleAddFromAudience={handleAddFromAudience}
                            handleAddContact={handleAddContact}
                            onStatusChange={onStatusChange}
                            isAllFilteredSelected={isAllFilteredSelected}
                            setIsAllFilteredSelected={setIsAllFilteredSelected}
                            supabase={supabase}
                            addContactToQueue={handleAddContactToQueue}
                            removeContactsFromQueue={handleRemoveContactsFromQueue} />
                    </>
                )}
            </Await>
        </Suspense >
    );
} 

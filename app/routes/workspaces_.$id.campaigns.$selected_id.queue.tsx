import { ActionFunctionArgs, defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Await, useFetcher, useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { Suspense, useState } from "react";
import { QueueTable } from "~/components/QueueTable";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Spinner } from "~/components/ui/spinner";
import { Database } from "~/lib/database.types";
import { Button } from "~/components/ui/button";
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "~/components/ui/select";

type LoaderData = {
    queuePromise: Promise<QueueResponse>;
    audiences: Promise<{
        id: number;
        name: string;
    }[]>;
}

type QueueResponse = {
    queueData: Array<{
        id: number;
        status: string;
        contact: {
            firstname: string | null;
            surname: string | null;
            phone: string | null;
            [key: string]: any;
        } | null;
        [key: string]: any;
    }> | null;
    queueError: any;
    totalCount: number | null;
    currentPage: number;
    pageSize: number;
    filters: {
        name: string;
        phone: string;
        status: string;
    }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { id: workspace_id, selected_id } = params;
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const page = Number(searchParams.get("page")) || 1;
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const nameFilter = searchParams.get("name") || "";
    const phoneFilter = searchParams.get("phone") || "";
    const statusFilter = searchParams.get("status") || "";
    const sortParam = searchParams.get("sort");

    const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);

    if (!serverSession?.user) return redirect("/signin");
    if (!workspace_id || !selected_id) return redirect("../../");

    const audiencesPromise = (async () => {
        const { data: audiences, error: audiencesError } = await supabaseClient
            .from("audience")
            .select("id, name")
            .eq("workspace", workspace_id);  
        if (audiencesError) throw new Error(audiencesError.message);
        return audiences || [];
    })();

    const queuePromise = (async () => {
        let query = supabaseClient
            .from("campaign_queue")
            .select('*, contact!inner(*)', { count: 'exact' })
            .eq("campaign_id", Number(selected_id));

        if (nameFilter) {
            query = query.or(`firstname.ilike.%${nameFilter}%,surname.ilike.%${nameFilter}%`, { foreignTable: 'contact' });
        }
        if (phoneFilter) {
            query = query.ilike('contact.phone', `%${phoneFilter}%`);
        }
        if (statusFilter) {
            query = query.eq('status', statusFilter);
        }   
        // Apply sorting
        if (sortParam) {
            const [field, direction] = sortParam.split('.');
            query = query.order(field, { ascending: direction === 'asc' });
        } else {
            query = query.order('id', { ascending: true });
        }

        // Apply pagination
        const { data: queueData, error: queueError, count: qcount } = await query
            .range(offset, offset + pageSize - 1);

        return {
            queueData,
            queueError,
            totalCount: qcount,
            currentPage: page,
            pageSize,
            filters: {
                name: nameFilter,
                phone: phoneFilter,
                status: statusFilter,
            }
        };
    })();

    return defer({ 
        audiences: audiencesPromise,
        queuePromise,
        campaignId: selected_id
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { supabaseClient, serverSession } = await getSupabaseServerClientWithSession(request);
    if (!serverSession?.user) return redirect("/signin");

    if (request.method === "POST") {
        const { ids, newStatus } = await request.json();
        const url = new URL(request.url);
        const searchParams = url.searchParams;
        const nameFilter = searchParams.get("name") || "";
        const phoneFilter = searchParams.get("phone") || "";
        const statusFilter = searchParams.get("status") || "";
        if (!ids || !newStatus) return json({ error: "Missing ids or newStatus" });
        let updateIds = ids;
        if (ids === 'all') {
            updateIds = [];
        }

        let updateQuery = supabaseClient
            .from("campaign_queue")
            .update({ status: newStatus })
            .eq('campaign_id', Number(params.selected_id));

        if (ids === 'all') {
            let searchQuery = supabaseClient
                .from("campaign_queue")
                .select('id, contact!inner(*)')
                .eq('campaign_id', Number(params.selected_id));
            if (nameFilter) {
                searchQuery = searchQuery.or(`firstname.ilike.%${nameFilter}%,surname.ilike.%${nameFilter}%`, { foreignTable: 'contact' });
            }
            if (phoneFilter) {
                searchQuery = searchQuery.ilike('contact.phone', `%${phoneFilter}%`);
            }
            if (statusFilter) {
                searchQuery = searchQuery.eq('status', statusFilter);
            }
            const { data: ids, error: searchError } = await searchQuery;
            if (searchError) return json({ error: searchError.message });
            updateIds = ids?.map((item: any) => item.id) || [];
            updateQuery = updateQuery.in('id', updateIds);
        } else {
            updateQuery = updateQuery.in('id', ids);
        }

        const { error } = await updateQuery;

        if (error) {
            return json({ error: error.message });
        }
    }
    return json({ success: true });
};

export default function Queue() {
    const { queuePromise, audiences, campaignId } = useLoaderData<typeof loader>();
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const [isSelectingAudience, setIsSelectingAudience] = useState(false);
    const fetcher = useFetcher();

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
        console.log("Add Contact");
    }
    console.log(fetcher.data);
    return (
        <Suspense fallback={
            <div className="flex justify-center items-center p-8">
                <Spinner className="h-8 w-8" />
            </div>
        }>
            <Await resolve={queuePromise} errorElement={<div>Error loading queue</div>}>
                {(queueValue: QueueResponse) => (
                    <Await resolve={audiences} errorElement={<div>Error loading audiences</div>}>
                        {(audienceValue: Array<{ id: number; name: string | null }>) => (
                            queueValue?.queueError ? <div>{queueValue.queueError.message}</div> :
                            <div className="p-2">
                                <div className="flex justify-between items-center">
                                    <div className="text-sm text-gray-500">
                                        {queueValue.totalCount} contacts
                                    </div>
                                    <div className="flex gap-2">
                                        {!isSelectingAudience ? <Button variant="outline" size="sm" onClick={() => {
                                            setIsSelectingAudience(true);
                                        }}>
                                            Add from Audience
                                        </Button> : 
                                        <Select onValueChange={handleAddFromAudience}>     
                                            <SelectTrigger> 
                                                <SelectValue placeholder="Select Audience" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {audienceValue.map((audience) => (
                                                    <SelectItem key={audience.id} value={audience.id}>{audience.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>}
                                        <Button variant="outline" size="sm" onClick={() => handleAddContact()}>
                                            Search/Add Contact
                                        </Button>
                                    </div>
                                </div>
                                <QueueTable
                                    queue={queueValue.queueData}
                                    totalCount={queueValue.totalCount}
                                    currentPage={queueValue.currentPage}
                                    pageSize={queueValue.pageSize}
                                    defaultFilters={queueValue.filters}
                                    onStatusChange={onStatusChange}
                                    isAllFilteredSelected={isAllFilteredSelected}
                                    onSelectAllFiltered={setIsAllFilteredSelected}
                                />
                            </div>
                        )}
                    </Await>
                )}
            </Await>
        </Suspense>
    );
}
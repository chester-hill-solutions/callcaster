import { ActionFunctionArgs, defer, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Await, useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { Suspense, useState } from "react";
import { QueueTable } from "~/components/QueueTable";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { Spinner } from "~/components/ui/spinner";
import { Database } from "~/lib/database.types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { selected_id } = params;
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
    if (!selected_id) return redirect("../../");

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

    return defer({ queuePromise });
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
        if (!ids || !newStatus) return { error: "Missing ids or newStatus" };
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
            if (searchError) return { error: searchError.message };
            updateIds = ids?.map((item: any) => item.id) || [];
            updateQuery = updateQuery.in('id', updateIds);
        } else {
            updateQuery = updateQuery.in('id', ids);
        }
        
        const { error } = await updateQuery;

        if (error) {
            return { error: error.message };
        }
    }
    return { success: true };
};

export default function Queue() {
    const { queuePromise } = useLoaderData<typeof loader>();
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const submit = useSubmit();

    const onStatusChange = async (ids: string[], newStatus: string) => {
        const queueData = {
            ids: isAllFilteredSelected ? 'all' : ids,
            newStatus,
        };
        submit(queueData, { method: "POST", encType: "application/json" });
    };

    return (
        <Suspense fallback={
            <div className="flex justify-center items-center p-8">
                <Spinner className="h-8 w-8" />
            </div>
        }>
            <Await resolve={queuePromise}>
                {(queueData) => (
                    queueData.queueError ? <div>{queueData.queueError.message}</div> :
                        <QueueTable
                            queue={queueData.queueData}
                            totalCount={queueData.totalCount}
                            currentPage={queueData.currentPage}
                            pageSize={queueData.pageSize}
                            defaultFilters={queueData.filters}
                            onStatusChange={onStatusChange}
                            isAllFilteredSelected={isAllFilteredSelected}
                            onSelectAllFiltered={setIsAllFilteredSelected}
                        />
                )}
            </Await>
        </Suspense>
    );
} 

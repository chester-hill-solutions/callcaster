import { Audience, CampaignQueue, Contact, Queue, QueueItem } from "@/lib/types";
import { QueueHeader } from "./QueueHeader";
import { QueueTable } from "@/components/queue/QueueTable";
import SupabaseClient from "@supabase/supabase-js/dist/module/SupabaseClient";
import { useEffect, useState, useRef } from "react";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { AppError } from "~/lib/types";

interface QueueContentProps {
<<<<<<< HEAD
    queueValue: {
        queueData: QueueItem[] | null;
        queueError: Error | null;
        totalCount: number | null;
        unfilteredCount: number | null;
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
    };
    handleFilterChange: (key: string, value: string) => void;
    clearFilter: () => void;
    audiences: Audience[];
    isSelectingAudience: boolean;
    selectedAudience: number | null;
    setIsSelectingAudience: (value: boolean) => void;
    setSelectedAudience: (value: number | null) => void;
    handleAddFromAudience: (value: number) => void;
    handleAddContact: () => void;
    onStatusChange: (ids: string[], newStatus: string) => void;
    isAllFilteredSelected: boolean;
    setIsAllFilteredSelected: (value: boolean) => void;
    addContactToQueue: (contact: (Contact & { contact_audience: { audience_id: number }[] })[]) => void;
    removeContactsFromQueue: (ids: string[] | 'all') => void;
    supabase: SupabaseClient;
    selectedAudienceIds:number[]
=======
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
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilter: () => void;
  onStatusChange: (ids: string[], newStatus: string, isAllSelected: boolean) => void;
  onAddFromAudience: (audienceId: number) => void;
  onAddContactToQueue: (contacts: Contact[]) => void;
  onRemoveContactsFromQueue: (ids: string[] | 'all') => void;
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
}

export function QueueContent({
    queueValue,
    handleFilterChange,
    clearFilter,
    audiences,
    isSelectingAudience,
    selectedAudience,
    setIsSelectingAudience,
    setSelectedAudience,
    handleAddFromAudience,
    handleAddContact,
    onStatusChange,
    isAllFilteredSelected,
    setIsAllFilteredSelected,
    addContactToQueue,
    removeContactsFromQueue,
    supabase,
    selectedAudienceIds
}: QueueContentProps) {
    if (queueValue?.queueError) return <div>{queueValue.queueError.message}</div>;
    const [queueCount, setQueueCount] = useState(queueValue.totalCount ?? 0);
    const [queueData, setQueueData] = useState(queueValue.queueData ?? []);
    const pendingUpdates = useRef<Set<number>>(new Set());

    const fetchContactById = async (id: number) => {
        if (pendingUpdates.current.has(id)) return null;

        pendingUpdates.current.add(id);
        try {
            const { data, error } = await supabase.from('contact').select('*').eq('id', id).single();
            return data;
        } finally {
            pendingUpdates.current.delete(id);
        }
    }

    const handleAddRealtimeQueue = async (payload: RealtimePostgresChangesPayload<CampaignQueue>) => {
        if (payload.eventType === 'INSERT') {
            if (queueData.length >= 50) return;
            const contact = await fetchContactById(payload.new.contact_id);
            if (contact) {
                setQueueData(curr => [...curr, { ...payload.new, contact }].slice(0, 50));
            }
        }
        if (payload.eventType === 'DELETE') {
            setQueueData(curr => curr.filter(item => item.id !== payload.old.id));
        }
    }

    useEffect(() => {
        const channel = supabase.channel('campaign_queue')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'campaign_queue',
            }, (payload: RealtimePostgresChangesPayload<CampaignQueue>) => {
                setQueueCount(curr => {
                    if (payload.eventType === 'DELETE') {
                        return Math.max(0, curr - 1);
                    }
                    if (payload.eventType === 'INSERT') {
                        return curr + 1;
                    }
                    return curr;
                });
                handleAddRealtimeQueue(payload);
            })
            .subscribe();

        return () => {
            pendingUpdates.current.clear();
            supabase.removeChannel(channel);
        }
    }, []);

    // Update queue data when parent data changes
    useEffect(() => {
        setQueueData(queueValue.queueData ?? []);
    }, [queueValue.queueData]);

    return (
        <div className="p-2">
            <QueueHeader
                unfilteredCount={queueValue.unfilteredCount ?? 0}
                totalCount={queueValue.totalCount ?? 0}
                isSelectingAudience={isSelectingAudience}
                selectedAudience={selectedAudience}
                audiences={audiences}
                selectedCampaignAudienceIds={selectedAudienceIds}
                onSelectingAudienceChange={setIsSelectingAudience}
                onSelectedAudienceChange={setSelectedAudience}
                onAddFromAudience={handleAddFromAudience}
                onAddContact={handleAddContact}
            />
            <QueueTable
                unfilteredCount={queueValue.unfilteredCount ?? 0}
                handleFilterChange={handleFilterChange}
                queue={queueData || []}
                audiences={audiences}
                totalCount={queueValue.totalCount}
                currentPage={queueValue.currentPage}
                pageSize={queueValue.pageSize}
                defaultFilters={queueValue.filters}
                onStatusChange={onStatusChange}
                isAllFilteredSelected={isAllFilteredSelected}
                onSelectAllFiltered={setIsAllFilteredSelected}
                addContactToQueue={addContactToQueue}
                removeContactsFromQueue={removeContactsFromQueue}
                clearFilter={clearFilter}
            />
        </div>
    );
} 
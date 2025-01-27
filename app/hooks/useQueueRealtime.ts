import { useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { CampaignQueue, Contact } from "~/lib/types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseQueueRealtimeProps {
    supabase: SupabaseClient;
    onInsert?: (payload: RealtimePostgresChangesPayload<CampaignQueue>) => void;
    onDelete?: (payload: RealtimePostgresChangesPayload<CampaignQueue>) => void;
    onUpdate?: (payload: RealtimePostgresChangesPayload<CampaignQueue>) => void;
}

export const useQueueRealtime = ({
    supabase,
    onInsert,
    onDelete,
    onUpdate
}: UseQueueRealtimeProps) => {
    useEffect(() => {
        const channel = supabase.channel('campaign_queue')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'campaign_queue',
            }, (payload: RealtimePostgresChangesPayload<CampaignQueue>) => {
                switch (payload.eventType) {
                    case 'INSERT':
                        onInsert?.(payload);
                        break;
                    case 'DELETE':
                        onDelete?.(payload);
                        break;
                    case 'UPDATE':
                        onUpdate?.(payload);
                        break;
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        }
    }, [supabase, onInsert, onDelete, onUpdate]);
}; 
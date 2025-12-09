import { useEffect, useState, useRef, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

type ContactState = {
    isSyncing: boolean;
    error: Error | null;
};

interface RealtimePayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
}

/**
 * Hook for real-time data synchronization with Supabase
 * 
 * Subscribes to Supabase realtime changes for a specific table and workspace, automatically
 * updating local state when INSERT, UPDATE, or DELETE events occur. Handles initial data
 * fetching if not provided and manages subscription lifecycle.
 * 
 * @template T - Type of data items (must have an `id` property)
 * @param supabase - Supabase client instance
 * @param workspace_id - Workspace ID for filtering data
 * @param table - Table name to subscribe to
 * @param initialData - Optional initial data array (if provided, skips initial fetch)
 * 
 * @returns Object containing:
 *   - data: Array of data items from the table
 *   - isSyncing: Boolean indicating if initial sync or subscription setup is in progress
 *   - error: Error object if an error occurred, null otherwise
 * 
 * @example
 * ```tsx
 * interface Contact {
 *   id: number;
 *   name: string;
 *   phone: string;
 * }
 * 
 * const {
 *   data: contacts,
 *   isSyncing,
 *   error
 * } = useRealtimeData<Contact>(
 *   supabase,
 *   workspace.id,
 *   'contact',
 *   initialContacts // optional
 * );
 * 
 * if (isSyncing) {
 *   return <div>Loading...</div>;
 * }
 * 
 * if (error) {
 *   return <div>Error: {error.message}</div>;
 * }
 * 
 * return (
 *   <div>
 *     {contacts.map(contact => (
 *       <div key={contact.id}>{contact.name}</div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useRealtimeData<T extends { id: number | string }>(supabase: SupabaseClient, workspace_id: string, table: string, initialData: (T | null)[] | null = null) {
    const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null);
    const [data, setData] = useState<Record<string, T[]>>(() => ({
        [table]: initialData?.filter((item): item is T => Boolean(item)) || []
    }));
    // Initialize isSyncing to true if initialData is not provided (we need to fetch)
    const [state, setState] = useState<ContactState>({
        isSyncing: !initialData,
        error: null
    });

    // Fetch initial data if not provided
    useEffect(() => {
        if (!initialData) {
            setState(prev => ({ ...prev, isSyncing: true }));
            const column = table === 'workspace' ? 'id' : 'workspace_id';
            
            supabase
                .from(table)
                .select('*')
                .eq(column, workspace_id)
                .then(({ data: fetchedData, error }) => {
                    if (error) {
                        setState(prev => ({ ...prev, error: new Error(error.message) }));
                    } else if (fetchedData) {
                        setData(prev => ({ ...prev, [table]: fetchedData as T[] }));
                    }
                    setState(prev => ({ ...prev, isSyncing: false }));
                });
        }
    }, [supabase, table, workspace_id, initialData]);

    // Memoize filter to avoid recreating on every render
    const filter = useMemo(() => {
        return table === 'workspace' 
            ? `id=eq.${workspace_id}`
            : table === 'campaign' || table === 'contact'
                ? `workspace=eq.${workspace_id}`
                : `workspace_id=eq.${workspace_id}`;
    }, [table, workspace_id]);

    useEffect(() => {
        const channelKey = `${workspace_id}-${table}`;
        const channel = supabase.channel(channelKey);
        channelRef.current = channel;

        function handlePayload(payload: RealtimePayload) {
            try {
                switch (payload.eventType) {
                    case 'INSERT':
                        setData(prev => {
                            const newItem = payload.new as T;
                            const currentTableData = prev[table] || [];
                            // Early return if item already exists
                            if (currentTableData.some(item => item.id === newItem.id)) {
                                return prev;
                            }
                            return { 
                                ...prev, 
                                [table]: [...currentTableData, newItem] 
                            };
                        });
                        break;
                    case 'UPDATE':
                        setData(prev => {
                            const updatedItem = payload.new as T;
                            const currentTableData = prev[table] || [];
                            // Early return if item not found
                            if (!currentTableData.some(item => item.id === updatedItem.id)) {
                                return prev;
                            }
                            return { 
                                ...prev, 
                                [table]: currentTableData.map(item => 
                                    item.id === updatedItem.id ? updatedItem : item
                                )
                            };
                        });
                        break;
                    case 'DELETE':
                        setData(prev => {
                            const deletedItem = payload.old as T;
                            const currentTableData = prev[table] || [];
                            // Early return if item not found
                            if (!currentTableData.some(item => item.id === deletedItem.id)) {
                                return prev;
                            }
                            return { 
                                ...prev, 
                                [table]: currentTableData.filter(item => 
                                    item.id !== deletedItem.id
                                )
                            };
                        });
                        break;
                }
            } catch (error) {
                console.error('Error processing realtime update:', error);
                setState(prev => ({ ...prev, error: error as Error }));
            }
        }

        channel
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: table,
                filter: filter
            }, handlePayload)
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    setState(prev => ({ ...prev, isSyncing: false, error: null }));
                } else if (status === 'CLOSED') {
                    // Subscription closed - no need to log in production
                    setState(prev => ({ ...prev, isSyncing: false }));
                } else if (status === 'CHANNEL_ERROR') {
                    const error = new Error(`Failed to subscribe to realtime updates for ${table}`);
                    console.error(error.message);
                    setState(prev => ({ ...prev, error, isSyncing: false }));
                } else if (status === 'TIMED_OUT') {
                    const error = new Error(`Subscription to ${table} timed out`);
                    console.error(error.message);
                    setState(prev => ({ ...prev, error, isSyncing: false }));
                }
            });

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [supabase, workspace_id, table, filter]);

    return { data: data[table], ...state };
}


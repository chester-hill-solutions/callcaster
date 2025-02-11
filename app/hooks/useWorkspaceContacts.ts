import { useEffect, useState } from 'react';
import { Contact } from '~/lib/types';
import { SupabaseClient } from '@supabase/supabase-js';

interface UseWorkspaceContactsProps {
    supabase: SupabaseClient;
    workspace_id: string;
    initialContacts?: Contact[];
}

type ContactState = {
    isSyncing: boolean;
    error: Error | null;
};

let channels: Record<string, ReturnType<SupabaseClient['channel']>> = {};

export function useRealtimeData<T>(supabase: SupabaseClient, workspace_id: string, table: string, initialData: (T | null)[] | null = null) {
    const [data, setData] = useState<Record<string, T[]>>(() => ({
        [table]: initialData?.filter((item): item is T => Boolean(item)) || []
    }));
    const [state, setState] = useState<ContactState>({
        isSyncing: false,
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

    useEffect(() => {
        const channelKey = `${workspace_id}-${table}`;
        if (!channels[channelKey]) {
            const filter = table === 'workspace' 
                ? `id=eq.${workspace_id}`
                : table === 'campaign' || table === 'contact'
                    ? `workspace=eq.${workspace_id}`
                    : `workspace_id=eq.${workspace_id}`;

            channels[channelKey] = supabase.channel(channelKey)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: filter
                }, handlePayload)
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`Successfully subscribed to ${table} changes`);
                    } else if (status === 'CLOSED') {
                        console.log(`${table} subscription closed`);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error(`Error subscribing to ${table} changes`);
                        setState(prev => ({ ...prev, error: new Error('Failed to subscribe to realtime updates') }));
                    }
                });
        }

        function handlePayload(payload: any) {
            console.log('Realtime payload:', payload);
            try {
                switch (payload.eventType) {
                    case 'INSERT':
                        setData(prev => {
                            if (prev[table].some(item => (item as any).id === (payload.new as any).id)) {
                                return prev;
                            }
                            return { 
                                ...prev, 
                                [table]: [...prev[table], payload.new as T] 
                            };
                        });
                        break;
                    case 'UPDATE':
                        setData(prev => ({ 
                            ...prev, 
                            [table]: prev[table].map(item => 
                                (item as any).id === (payload.new as any).id ? payload.new as T : item
                            )
                        }));
                        break;
                    case 'DELETE':
                        setData(prev => ({ 
                            ...prev, 
                            [table]: prev[table].filter(item => 
                                (item as any).id !== (payload.old as any).id
                            )
                        }));
                        break;
                }
            } catch (error) {
                console.error('Error processing realtime update:', error);
                setState(prev => ({ ...prev, error: error as Error }));
            }
        }

        return () => {
            if (channels[channelKey]) {
                supabase.removeChannel(channels[channelKey]);
                delete channels[channelKey];
            }
        };
    }, [supabase, workspace_id, table]);

    return { data: data[table], ...state };
}

export function useWorkspaceContacts({
    supabase,
    workspace_id,
    initialContacts = []
}: UseWorkspaceContactsProps) {
    const [contacts, setContacts] = useState<Contact[]>(initialContacts);
    const [state, setState] = useState<ContactState>({
        isSyncing: false,
        error: null
    });

    const fetchContacts = async () => {
        setState(prev => ({ ...prev, isSyncing: true }));
        try {
            const { data: contacts } = await supabase
                .from('contact')
                .select('*')
                .eq('workspace', workspace_id);
            
            if (contacts) {
                setContacts(contacts);
            }
            setState(prev => ({ ...prev, isSyncing: false }));
        } catch (error) {
            setState(prev => ({
                isSyncing: false,
                error: error as Error
            }));
        }
    };

    // Initial fetch
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (contacts.length) return;
        fetchContacts();
    }, [workspace_id]);

    // Real-time updates
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const channel = supabase
            .channel('contacts-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contact',
                    filter: `workspace=eq.${workspace_id}`
                },
                async (payload) => {
                    try {
                        switch (payload.eventType) {
                            case 'INSERT':
                                setContacts(prev => [...prev, payload.new as Contact]);
                                break;
                            case 'UPDATE':
                                setContacts(prev => 
                                    prev.map(contact => 
                                        contact.id === payload.new.id ? payload.new as Contact : contact
                                    )
                                );
                                break;
                            case 'DELETE':
                                setContacts(prev => 
                                    prev.filter(contact => contact.id !== payload.old.id)
                                );
                                break;
                        }
                    } catch (error) {
                        setState(prev => ({ ...prev, error: error as Error }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, workspace_id]);

    // Query methods
    const findContactByPhone = (phone: string) => {
        return contacts.filter(contact => contact.phone === phone);
    };

    const searchContacts = (query: string) => {
        const searchTerm = query.toLowerCase();
        return contacts.filter(contact => 
            contact.firstname?.toLowerCase().includes(searchTerm) ||
            contact.surname?.toLowerCase().includes(searchTerm) ||
            contact.phone?.includes(query) ||
            contact.email?.toLowerCase().includes(searchTerm)
        );
    };

    const getAllContacts = () => contacts;

    return {
        findContactByPhone,
        searchContacts,
        getAllContacts,
        contacts,
        ...state
    };
} 
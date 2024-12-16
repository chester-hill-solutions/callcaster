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
import { useEffect, useState, useMemo, useCallback } from "react";
import debounce from "lodash.debounce";

export function useSupabaseRealtime({ user, supabase, init, nextRecipient }) {
    const [queue, setQueue] = useState(init.queue);
    const [callsList, setCalls] = useState(init.callsList);
    const [attemptList, setAttempts] = useState(init.attempts);
    const [recentCall, setRecentCall] = useState(init.recentCall);
    const [recentAttempt, setRecentAttempt] = useState(init.recentAttempt);

    const updateAttempts = useCallback((payload) => {
        const newAttempts = [...attemptList];
        const index = newAttempts.findIndex(item => item.id === payload.new.id);
        const calls = callsList.filter((call) => call.outreach_attempt_id === payload.new.id);
        if (index > -1) {
            newAttempts[index] = { ...payload.new, call: calls };
        } else {
            newAttempts.push({ ...payload.new, call: calls });
        }
        setAttempts(newAttempts);

        const recentAttempt = newAttempts
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .find(call => call.contact_id === nextRecipient?.contact.id);
        setRecentAttempt(recentAttempt || {});
    }, [attemptList, callsList, nextRecipient]);

    const updateCalls = useCallback((payload) => {
        const attemptId = payload.new.outreach_attempt_id;
        if (attemptId) {
            setAttempts((currentData) => {
                const newData = [...currentData];
                const index = newData.findIndex(item => item.id === attemptId);
                if (index > -1) {
                    newData[index] = {
                        ...newData[index],
                        call: [...(newData[index].call || []), payload.new]
                    };
                }
                return newData;
            });
        }
        setCalls((currentData) => {
            const index = currentData.findIndex(item => item.sid === payload.new.sid);
            if (index > -1) {
                const newData = [...currentData];
                newData[index] = { ...payload.new };
                return newData;
            }
            return [{ ...payload.new }, ...currentData];
        });
    }, []);

    const updateQueue = useCallback((payload) => {
        if (payload.new.status !== user.id) return;
        setQueue((currentData) => {
            const newData = [...currentData];
            const index = newData.findIndex(item => item.id === payload.new.id);
            if (index > -1) {
                newData[index] = { ...payload.new };
            } else {
                newData.push({ ...payload.new });
            }
            return newData;
        });
    }, [user.id]);

    useEffect(() => {
        function handleChange(payload) {
            switch (payload.table) {
                case 'outreach_attempt':
                    updateAttempts(payload);
                    break;
                case 'call':
                    updateCalls(payload);
                    break;
                case 'campaign_queue':
                    updateQueue(payload);
                    break;
                default:
                    return;
            }
        }

        const debouncedHandleChange = debounce(handleChange, 300);
        
        const subscription = supabase
            .channel('schema-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: '*' }, debouncedHandleChange)
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
            debouncedHandleChange.cancel();
        };
    }, [supabase, updateAttempts, updateCalls, updateQueue]);

    useEffect(() => {
        const newRecentCall = callsList
            .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))
            .find(call => call.contact_id === nextRecipient?.contact.id);
        setRecentCall(newRecentCall || {});
    }, [callsList, nextRecipient]);

    return { queue, callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, setQueue };
}

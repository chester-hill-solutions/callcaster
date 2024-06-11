import { useEffect, useState, useCallback } from "react";

export function useSupabaseRealtime({ user, supabase, init, nextRecipient, contacts, setNextRecipient }) {
    const [queue, setQueue] = useState(init.queue);
    const [callsList, setCalls] = useState(init.callsList);
    const [attemptList, setAttempts] = useState(init.attempts);
    const [recentCall, setRecentCall] = useState(init.recentCall);
    const [recentAttempt, setRecentAttempt] = useState(init.recentAttempt);
    const [pendingCalls, setPendingCalls] = useState([]);

    const isRecent = (date) => {
        const created = new Date(date);
        const now = new Date();
        return (now - created) / 3600000 < 24;
    };

    const processPendingCalls = useCallback((attemptId) => {
        setPendingCalls((currentPendingCalls) => {
            const callsToProcess = currentPendingCalls.filter(call => call.outreach_attempt_id === attemptId);
            const remainingCalls = currentPendingCalls.filter(call => call.outreach_attempt_id !== attemptId);

            setAttempts((currentData) => {
                return currentData.map(item => item.id === attemptId
                    ? { ...item, call: [...(item.call || []), ...callsToProcess] }
                    : item
                );
            });
            setCalls((currentCalls) => [...currentCalls, ...callsToProcess]);

            return remainingCalls;
        });
    }, []);

    const updateAttempts = useCallback((payload) => {
        setAttempts((currentAttempts) => {
            const index = currentAttempts.findIndex(item => item.id === payload.new.id);
            const calls = callsList.filter(call => call.outreach_attempt_id === payload.new.id);
            const newAttempts = index > -1
                ? currentAttempts.map(item => item.id === payload.new.id ? { ...payload.new, call: calls } : item)
                : [...currentAttempts, { ...payload.new, call: calls }];

            return newAttempts;
        });
        processPendingCalls(payload.new.id);
        setRecentAttempt(isRecent(payload.new.date_created) ? payload.new : {});
    }, [callsList, processPendingCalls]);

    const updateCalls = useCallback((payload) => {
        const attemptId = payload.new.outreach_attempt_id;
        if (attemptId) {
            setAttempts((currentAttempts) => {
                return currentAttempts.map(item => item.id === attemptId
                    ? { ...item, call: [...(item.call || []), payload.new] }
                    : item
                );
            });
            setCalls((currentCalls) => [...currentCalls, payload.new]);
            setRecentCall(payload.new.contact_id === recentAttempt?.contact?.id ? payload.new : recentCall);
        } else {
            setPendingCalls((currentPendingCalls) => [...currentPendingCalls, payload.new]);
        }
    }, [recentAttempt]);

    const updateQueue = useCallback((payload) => {
        if (payload.new.status === 'dequeued') {
            setQueue((currentQueue) => currentQueue.filter(item => item.id !== payload.new.id));
        } else if (payload.new.status === user.id) {
            const contact = contacts.find(contact => contact.id === payload.new.contact_id);
            if (contact?.phone) {
                setNextRecipient({ ...payload.new, contact });
                setQueue((currentQueue) => {
                    const index = currentQueue.findIndex(item => item.id === payload.new.id);
                    return index > -1
                        ? currentQueue.map(item => item.id === payload.new.id ? { ...payload.new, contact } : item)
                        : [...currentQueue, { ...payload.new, contact }];
                });
            }
        }
    }, [user.id, contacts, setNextRecipient]);

    useEffect(() => {
        const handleChange = (payload) => {
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
                    break;
            }
        };

        const subscription = supabase
            .channel('schema-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: '*' }, handleChange)
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [supabase, updateAttempts, updateCalls, updateQueue]);

    useEffect(() => {
        if (pendingCalls.length) {
            pendingCalls.forEach(call => processPendingCalls(call.outreach_attempt_id));
        }
    }, [pendingCalls, processPendingCalls]);

    useEffect(() => {
        const newRecentCall = nextRecipient?.contact
            ? callsList
                .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))
                .find(call => call.contact_id === nextRecipient.contact.id)
            : null;
        setRecentCall(isRecent(newRecentCall?.date_created) ? newRecentCall : {});
    }, [callsList, nextRecipient]);

    return { queue, callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, setQueue };
}

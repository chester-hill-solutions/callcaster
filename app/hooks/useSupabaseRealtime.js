import { useEffect, useState, useCallback } from "react";

export function useSupabaseRealtime({ user, supabase, init, nextRecipient, contacts, setNextRecipient, campaign_id, predictive = false }) {
    const [queue, setQueue] = useState(init.queue);
    const [predictiveQueue, setPredictiveQueue] = useState(init.predictiveQueue)
    const [callsList, setCalls] = useState(init.callsList);
    const [attemptList, setAttempts] = useState(init.attempts);
    const [recentCall, setRecentCall] = useState(init.recentCall);
    const [recentAttempt, setRecentAttempt] = useState(init.recentAttempt);
    const [pendingCalls, setPendingCalls] = useState([]);
    const [isNextRecipientSet, setIsNextRecipientSet] = useState(false);

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
        if (payload.new.user_id !== user.id) return;
        if (payload.new.campaign_id !== campaign_id) return;
        const calls = callsList.filter(call => (call.outreach_attempt_id === payload.new.id) && (call.direction !== 'outbound-api'));
        let updatedAttempt = { ...payload.new, call: calls };
        if (calls.length && calls[0].status && !updatedAttempt.result.status) {
            updatedAttempt.result = { ...(updatedAttempt.result && {...updatedAttempt.result, status: calls[0].status }), status: calls[0].status };
        }

        setAttempts((currentAttempts) => {
            const index = currentAttempts.findIndex(item => item.id === payload.new.id);
            const newAttempts = index > -1
                ? currentAttempts.map(item => item.id === payload.new.id ? updatedAttempt : item)
                : [...currentAttempts, updatedAttempt];
            return newAttempts;
        });
        processPendingCalls(payload.new.id);
        setRecentAttempt(isRecent(updatedAttempt?.created_at) ? updatedAttempt : {});
    }, [callsList, processPendingCalls]);

    const updateCalls = useCallback((payload) => {
        const attemptId = payload.new.outreach_attempt_id;
        let updatedCall = payload.new;
    
        if (attemptId) {
            setAttempts((currentAttempts) => {
                const updatedAttempts = currentAttempts.map(item => {
                    if (item.id === attemptId && item.user_id === user.id) {
                        const updatedItem = {
                            ...item,
                            call: [...(item.call || []), updatedCall],
                            result: {
                                ...(item.result || {}),
                                ...(updatedCall.status && updatedCall.direction !== 'outbound-api' && { status: updatedCall.status })
                            }
                        };
                        return updatedItem;
                    }
                    return item;
                });
                return updatedAttempts;
                });
                setCalls((currentCalls) => [...currentCalls, updatedCall]);
                setRecentCall(recentAttempt?.contact?.id === updatedCall.contact_id ? updatedCall : recentCall);
                setNextRecipient(queue.find((contact) => updatedCall.contact_id === contact.contact.id));
        } else {
            setPendingCalls((currentPendingCalls) => [...currentPendingCalls, updatedCall]);
        }
    }, [recentAttempt?.contact?.id, recentCall, queue, setNextRecipient, user.id]);
    
    const updateQueue = useCallback((payload) => {
        if (payload.new.status === 'dequeued') {
            setQueue((currentQueue) => {
                const filteredQueue = currentQueue.filter(item => item.id !== payload.new.id);
                if (nextRecipient && nextRecipient.id === payload.new.contact_id) {
                    setIsNextRecipientSet(false);
                    if (filteredQueue.length > 0) {
                        setNextRecipient(filteredQueue[0]);
                    } else {
                        setNextRecipient(null);
                    }
                }
                return filteredQueue;
            });
            setPredictiveQueue((currentQueue) => {
                const filteredQueue = currentQueue.filter(item => item.id !== payload.new.id);
                if (nextRecipient && nextRecipient.id === payload.new.contact_id) {
                    setIsNextRecipientSet(false);
                    if (filteredQueue.length > 0) {
                        setNextRecipient(filteredQueue[0]);
                    } else {
                        setNextRecipient(null);
                    }
                }
                return filteredQueue;
            });
        } else if (payload.new.status === user.id) {
            const contact = contacts.find(contact => contact.id === payload.new.contact_id);
            if (contact?.phone) {
                setQueue((currentQueue) => {
                    const index = currentQueue.findIndex(item => item.id === payload.new.id);
                    const updatedQueue = index > -1
                        ? currentQueue.map(item => item.id === payload.new.id ? { ...payload.new, contact } : item)
                        : [...currentQueue, { ...payload.new, contact }];
                    return updatedQueue;
                });
    
                if (!isNextRecipientSet || (nextRecipient && nextRecipient.id === payload.new.id)) {
                    setNextRecipient({ ...payload.new, contact });
                    setIsNextRecipientSet(true);
                }
            }
        }
    }, [user.id, contacts, nextRecipient, isNextRecipientSet, setNextRecipient]);
        
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

import { useEffect, useState, useCallback } from "react";
import debounce from "lodash.debounce";

export function useSupabaseRealtime({ user, supabase, init, nextRecipient, contacts, setNextRecipient }) {
    const [queue, setQueue] = useState(init.queue);
    const [callsList, setCalls] = useState(init.callsList);
    const [attemptList, setAttempts] = useState(init.attempts);
    const [recentCall, setRecentCall] = useState(init.recentCall);
    const [recentAttempt, setRecentAttempt] = useState(init.recentAttempt);
    const [pendingCalls, setPendingCalls] = useState([]);

    const processPendingCalls = useCallback((attemptId) => {
        setPendingCalls((currentPendingCalls) => {
            const callsToProcess = currentPendingCalls.filter(call => call.outreach_attempt_id === attemptId);
            const remainingCalls = currentPendingCalls.filter(call => call.outreach_attempt_id !== attemptId);

            setAttempts((currentData) => {
                const newData = [...currentData];
                const index = newData.findIndex(item => item.id === attemptId);
                if (index > -1) {
                    const calls = [...(newData[index].call || []), ...callsToProcess];
                    newData[index] = {
                        ...newData[index],
                        call: calls
                    };
                }
                return newData;
            });

            setCalls((currentCalls) => [...currentCalls, ...callsToProcess]);

            return remainingCalls;
        });
    }, []);


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
        processPendingCalls(payload.new.id);
        const recentAttempt = nextRecipient.contact? newAttempts
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .find(call => call.contact_id === nextRecipient?.contact?.id) : {};
        setRecentAttempt(recentAttempt || {});
    }, [attemptList, callsList, nextRecipient, processPendingCalls]);

    const updateCalls = useCallback((payload) => {
        const attemptId = payload.new.outreach_attempt_id;
        if (attemptId) {
            const attemptExists = attemptList.some(item => item.id === attemptId);
            if (attemptExists) {
                setAttempts((currentData) => {
                    const newData = [...currentData];
                    const index = newData.findIndex(item => item.id === attemptId);
                    if (index > -1) {
                        const calls = [...(newData[index].call || []), payload.new];
                        newData[index] = {
                            ...newData[index],
                            call: calls
                        };
                    }
                    return newData;
                });
                setCalls((currentCalls) => [...currentCalls, payload.new]);
            } else {
                setPendingCalls((currentPendingCalls) => [...currentPendingCalls, payload.new]);
            }
        }
    }, [attemptList]);


    const updateQueue = useCallback((payload) => {
        if (payload.new.status === 'dequeued') {
            setQueue((currentData) => {
                return currentData.filter((queue) => queue.id !== payload.new.id);
            });
        } else if (payload.new.status === user.id) {
            const contact = contacts?.find(contact => contact.id === payload.new.contact_id)
            if (contact.phone) {
                setNextRecipient({ ...payload.new, contact })
                setQueue((currentData) => {
                    const newData = [...currentData];
                    const index = newData.findIndex(item => item.id === payload.new.id);

                    if (index > -1) {
                        newData[index] = { ...payload.new, contact };
                    } else {
                        newData.push({ ...payload.new, contact });
                    }
                    return newData;
                });
            }
        }
    }, [user.id]);

    useEffect(() => {
        const handleChange = (payload) => {
            console.log(payload)
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
        function handleChange() {
            if (pendingCalls) {
                pendingCalls.map((call) => {
                    processPendingCalls(call.outreach_attempt_id)
                })
            }
        }
        const debouncedHandleChange = debounce(handleChange, 300);
        return () => debouncedHandleChange.cancel()
    }, [pendingCalls, processPendingCalls])

    useEffect(() => {
        const newRecentCall = nextRecipient.contact ? callsList
            .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))
            .find(call => call.contact_id === nextRecipient?.contact.id): {};
        setRecentCall(newRecentCall || {});
    }, [callsList, nextRecipient]);

    return { queue, callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, setQueue };
}

import { useState, useCallback } from "react";

export const useCalls = (initialCalls: Call[], initialRecentCall: Call | null) => {
  const [callsList, setCalls] = useState<Call[]>(initialCalls);
  const [recentCall, setRecentCall] = useState<Call | null>(initialRecentCall);
  const [pendingCalls, setPendingCalls] = useState<Call[]>([]);

  const updateCalls = useCallback((payload: { new: Call }, queue: QueueItem[], recentAttempt: Attempt | null, setNextRecipient: (recipient: QueueItem | null) => void, setQuestionContact: (contact: QueueItem | null) => void) => {
    const attemptId = payload.new.outreach_attempt_id;
    let updatedCall = payload.new;
    
    if (attemptId) {
      setCalls((currentCalls) => [...currentCalls, updatedCall]);
      setRecentCall(
        recentAttempt?.contact_id === updatedCall.contact_id ? updatedCall : recentCall
      );
      const newRecipient = queue.find((item) => updatedCall.contact_id === item.contact_id);
      setNextRecipient(newRecipient || null);
      setQuestionContact(newRecipient || null);
    } else if (payload.new.contact_id) {
      setPendingCalls((currentPendingCalls) => [...currentPendingCalls, updatedCall]);
    }
  }, []);

  return { callsList, setCalls, recentCall, setRecentCall, pendingCalls, setPendingCalls, updateCalls };
};
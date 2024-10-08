import { useState, useCallback, useEffect } from "react";
import { Tables } from "~/lib/database.types";

type Call = Tables<"call">
type Attempt = Tables<"outreach_attempt">
type Contact = Tables<"contact">
type QueueItem = Tables<"campaign_queue"> & { contact: Contact }

export const useCalls = (
  initialCalls: Call[], 
  initialRecentCall: Call | null,
  queue: QueueItem[],
  setNextRecipient: (recipient: QueueItem | null) => void,
  isPredictive: boolean
) => {
  const [callsList, setCalls] = useState<Call[]>(initialCalls);
  const [recentCall, setRecentCall] = useState<Call | null>(initialRecentCall);
  const [pendingCalls, setPendingCalls] = useState<Call[]>([]);

  const updateCalls = useCallback((
    payload: { new: Call }, 
    currentQueue: QueueItem[], 
    recentAttempt: Attempt | null, 
    setNextRecipient: (recipient: QueueItem | null) => void, 
    setQuestionContact: (contact: QueueItem | null) => void,
    setRecentAttempt: (attempt: Attempt | null) => void,
  ) => {
    const attemptId = payload.new.outreach_attempt_id;
    let updatedCall = payload.new;
    
    if (attemptId) {
      setCalls((currentCalls) => [...currentCalls, updatedCall]);
      setRecentCall(updatedCall);
      setRecentAttempt(null);
      
      if (!isPredictive) {
        const newRecipient = currentQueue.find((item) => updatedCall.contact_id === item.contact.id);
        if (newRecipient) {
          setNextRecipient(newRecipient);
          setQuestionContact(newRecipient);
        } else if (currentQueue.length > 0) {
          setNextRecipient(currentQueue[0]);
          setQuestionContact(currentQueue[0]);
        }
      }
    } else if (payload.new.contact_id) {
      setPendingCalls((currentPendingCalls) => [...currentPendingCalls, updatedCall]);
    }
  }, [isPredictive]);
  

  useEffect(() => {
    if (!recentCall && callsList.length > 0) {
      setRecentCall(callsList[callsList.length - 1]);
    }
  }, [callsList, recentCall]);

  return { callsList, setCalls, recentCall, setRecentCall, pendingCalls, setPendingCalls, updateCalls };
};
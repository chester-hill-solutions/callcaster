import { useState, useCallback, useEffect } from "react";
import { Tables } from "@/lib/database.types";

type Call = Tables<"call">
type Attempt = Tables<"outreach_attempt">
type Contact = Tables<"contact">
type QueueItem = Tables<"campaign_queue"> & { contact: Contact }

/**
 * Hook for managing call state and updates
 * 
 * Handles call updates from realtime subscriptions, tracks recent calls, and automatically
 * updates the next recipient in standard (non-predictive) dialing mode when calls complete.
 * Manages both calls with and without associated outreach attempts.
 * 
 * @param initialCalls - Initial list of calls
 * @param initialRecentCall - Initial recent call, if any
 * @param queue - Current queue items (for finding next recipient)
 * @param setNextRecipient - Function to set the next recipient in queue
 * @param isPredictive - Whether predictive dialing mode is enabled
 * 
 * @returns Object containing:
 *   - callsList: Array of all calls
 *   - setCalls: Function to manually set calls list
 *   - recentCall: Most recent call
 *   - setRecentCall: Function to manually set recent call
 *   - updateCalls: Function to update calls from realtime payload
 * 
 * @example
 * ```tsx
 * const {
 *   callsList,
 *   recentCall,
 *   updateCalls
 * } = useCalls(
 *   initialCalls,
 *   initialRecentCall,
 *   queue,
 *   setNextRecipient,
 *   isPredictive
 * );
 * 
 * // Update from realtime subscription
 * updateCalls(
 *   { new: updatedCall },
 *   queue,
 *   recentAttempt,
 *   setNextRecipient,
 *   setQuestionContact,
 *   setRecentAttempt
 * );
 * 
 * // Access recent call
 * if (recentCall) {
 *   console.log('Recent call:', recentCall.id);
 * }
 * ```
 */
export const useCalls = (
  initialCalls: Call[], 
  initialRecentCall: Call | null,
  queue: QueueItem[],
  setNextRecipient: (recipient: QueueItem | null) => void,
  isPredictive: boolean
) => {
  const [callsList, setCalls] = useState<Call[]>(initialCalls);
  const [recentCall, setRecentCall] = useState<Call | null>(initialRecentCall);

  const updateCalls = useCallback((
    payload: { new: Call }, 
    currentQueue: QueueItem[], 
    recentAttempt: Attempt | null, 
    setNextRecipient: (recipient: QueueItem | null) => void, 
    setQuestionContact: (contact: QueueItem | null) => void,
    setRecentAttempt: (attempt: Attempt | null) => void,
  ) => {
    // Validate payload
    if (!payload || !payload.new) {
      console.error('Invalid call update payload: payload or payload.new is missing');
      return;
    }

    if (!payload.new.id) {
      console.error('Invalid call update payload: payload.new.id is missing');
      return;
    }

    try {
      const attemptId = payload.new.outreach_attempt_id;
      const updatedCall = payload.new;
    
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
        // Call without attempt_id - could be tracked separately if needed in the future
        // For now, we just add it to the calls list
        setCalls((currentCalls) => [...currentCalls, updatedCall]);
      }
    } catch (error) {
      console.error('Error updating calls:', error);
    }
  }, [isPredictive]);
  

  useEffect(() => {
    if (!recentCall && callsList.length > 0) {
      setRecentCall(callsList[callsList.length - 1]);
    }
  }, [callsList, recentCall]);

  return { callsList, setCalls, recentCall, setRecentCall, updateCalls };
};
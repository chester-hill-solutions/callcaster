import { useState, useCallback, useEffect } from "react";
import { Tables } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";

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
    payload: { new: Call; eventType?: 'INSERT' | 'UPDATE' }, 
    currentQueue: QueueItem[], 
    recentAttempt: Attempt | null, 
    setNextRecipient: (recipient: QueueItem | null) => void, 
    setQuestionContact: (contact: QueueItem | null) => void,
    setRecentAttempt: (attempt: Attempt | null) => void,
  ) => {
    // Validate payload
    if (!payload || !payload.new) {
      logger.error('Invalid call update payload: payload or payload.new is missing');
      return;
    }

    if (!payload.new.id) {
      logger.error('Invalid call update payload: payload.new.id is missing');
      return;
    }

    try {
      const attemptId = payload.new.outreach_attempt_id;
      const updatedCall = payload.new;
      const isUpdate = payload.eventType === 'UPDATE';

    if (attemptId) {
      setCalls((currentCalls) => {
        const byId = currentCalls.findIndex((c) => c.id === updatedCall.id);
        const bySid = updatedCall.sid
          ? currentCalls.findIndex((c) => c.sid === updatedCall.sid)
          : -1;
        const idx = byId >= 0 ? byId : bySid;
        if (isUpdate && idx >= 0) {
          const next = currentCalls.slice();
          next[idx] = updatedCall;
          return next;
        }
        return [...currentCalls, updatedCall];
      });
      setRecentCall((prev) =>
        prev && (prev.id === updatedCall.id || prev.sid === updatedCall.sid)
          ? updatedCall
          : prev ?? updatedCall
      );
      if (!isUpdate) {
        setRecentAttempt(null);
      }
      if (!isPredictive && !isUpdate) {
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
        setCalls((currentCalls) => {
          const byId = currentCalls.findIndex((c) => c.id === updatedCall.id);
          const bySid = updatedCall.sid
            ? currentCalls.findIndex((c) => c.sid === updatedCall.sid)
            : -1;
          const idx = byId >= 0 ? byId : bySid;
          if (isUpdate && idx >= 0) {
            const next = currentCalls.slice();
            next[idx] = updatedCall;
            return next;
          }
          return [...currentCalls, updatedCall];
        });
      }
    } catch (error) {
      logger.error('Error updating calls:', error);
    }
  }, [isPredictive]);
  

  useEffect(() => {
    if (!recentCall && callsList.length > 0) {
      setRecentCall(callsList[callsList.length - 1]);
    }
  }, [callsList, recentCall]);

  return { callsList, setCalls, recentCall, setRecentCall, updateCalls };
};
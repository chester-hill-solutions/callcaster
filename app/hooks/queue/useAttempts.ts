import { useState, useCallback } from "react";
import { isRecent, updateAttemptWithCall } from "~/lib/utils";
import { User } from "@supabase/supabase-js";
import { Call, OutreachAttempt, QueueItem } from "~/lib/types";

/**
 * Hook for managing outreach attempts state and updates
 * 
 * Handles outreach attempt updates from realtime subscriptions, automatically updating
 * attempts with call data and tracking the most recent attempt for the current recipient.
 * Validates payloads and filters attempts by user and campaign.
 * 
 * @param initialAttempts - Initial list of outreach attempts
 * @param initialRecentAttempt - Initial recent attempt, if any
 * @param nextRecipient - Current recipient in queue (used to identify recent attempt)
 * 
 * @returns Object containing:
 *   - attemptList: Array of all outreach attempts
 *   - setAttempts: Function to manually set attempts list
 *   - recentAttempt: Most recent attempt for current recipient, if recent
 *   - setRecentAttempt: Function to manually set recent attempt
 *   - updateAttempts: Function to update attempts from realtime payload
 * 
 * @example
 * ```tsx
 * const {
 *   attemptList,
 *   recentAttempt,
 *   updateAttempts
 * } = useAttempts(
 *   initialAttempts,
 *   initialRecentAttempt,
 *   nextRecipient
 * );
 * 
 * // Update from realtime subscription
 * updateAttempts(
 *   { new: updatedAttempt },
 *   currentUser,
 *   campaign.id,
 *   callsList
 * );
 * 
 * // Use recent attempt
 * if (recentAttempt) {
 *   console.log('Recent attempt:', recentAttempt.id);
 * }
 * ```
 */
export const useAttempts = (initialAttempts: OutreachAttempt[], initialRecentAttempt: OutreachAttempt | null, nextRecipient: QueueItem | null) => {
  const [attemptList, setAttempts] = useState<OutreachAttempt[]>(initialAttempts);
  const [recentAttempt, setRecentAttempt] = useState<OutreachAttempt | null>(initialRecentAttempt);

  const updateAttempts = useCallback((payload: { new: OutreachAttempt }, user: User, campaign_id: number, callsList: Call[]) => {
    // Validate payload
    if (!payload || !payload.new) {
      console.error('Invalid attempt update payload: payload or payload.new is missing');
      return;
    }

    if (!payload.new.id) {
      console.error('Invalid attempt update payload: payload.new.id is missing');
      return;
    }

    if (!user?.id) {
      console.error('Invalid user: user.id is missing');
      return;
    }

    if (payload.new.user_id !== user.id || payload.new.campaign_id !== campaign_id) {
      return;
    }

    const calls = callsList.filter(
      (call) => call?.outreach_attempt_id === payload.new.id && call?.direction !== "outbound-api"
    );
    
    try {
      const updatedAttempt: OutreachAttempt = updateAttemptWithCall(payload.new, calls[0]);

    setAttempts((currentAttempts) => {
      const index = currentAttempts.findIndex((item) => item?.id === payload?.new?.id);
      return index > -1
        ? currentAttempts.map((item) => (item?.id === payload?.new?.id ? updatedAttempt : item))
        : [...currentAttempts, updatedAttempt];
    });

      if (nextRecipient && updatedAttempt && isRecent(updatedAttempt?.created_at) && updatedAttempt?.contact_id === nextRecipient?.contact?.id) {
        setRecentAttempt(updatedAttempt);
      }
    } catch (error) {
      console.error('Error updating attempt:', error);
    }
  }, [nextRecipient]);

  return { attemptList, setAttempts, recentAttempt, setRecentAttempt, updateAttempts };
};
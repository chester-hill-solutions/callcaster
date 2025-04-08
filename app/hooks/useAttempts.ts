import { useState, useCallback } from "react";
import { isRecent, updateAttemptWithCall } from "~/lib/utils";
import { User } from "@supabase/supabase-js";
import { Call, OutreachAttempt, QueueItem } from "~/lib/types";

export const useAttempts = (initialAttempts: OutreachAttempt[], initialRecentAttempt: OutreachAttempt | null, nextRecipient: QueueItem | null) => {
  const [attemptList, setAttempts] = useState<OutreachAttempt[]>(initialAttempts);
  const [recentAttempt, setRecentAttempt] = useState<OutreachAttempt | null>(initialRecentAttempt);

  const updateAttempts = useCallback((payload: { new: OutreachAttempt }, user: User, campaign_id: number, callsList: Call[]) => {
    if (payload?.new?.user_id !== user?.id || payload.new.campaign_id !== campaign_id) return;

    const calls = callsList.filter(
      (call) => call?.outreach_attempt_id === payload?.new?.id && call?.direction !== "outbound-api"
    );
    const updatedAttempt:OutreachAttempt = updateAttemptWithCall(payload.new, calls[0]);

    setAttempts((currentAttempts) => {
      const index = currentAttempts.findIndex((item) => item?.id === payload?.new?.id);
      return index > -1
        ? currentAttempts.map((item) => (item?.id === payload?.new?.id ? updatedAttempt : item))
        : [...currentAttempts, updatedAttempt];
    });

    if (nextRecipient && updatedAttempt && isRecent(updatedAttempt?.created_at) && updatedAttempt?.contact_id === nextRecipient?.contact?.id) {
      
      setRecentAttempt(updatedAttempt);
    }
  }, [nextRecipient]);

  return { attemptList, setAttempts, recentAttempt, setRecentAttempt, updateAttempts };
};
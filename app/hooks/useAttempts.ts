import { useState, useCallback } from "react";
import { Attempt, Call } from "./types";
import { isRecent, updateAttemptWithCall } from "~/lib/utils";

export const useAttempts = (initialAttempts: Attempt[], initialRecentAttempt: Attempt | null) => {
  const [attemptList, setAttempts] = useState<Attempt[]>(initialAttempts);
  const [recentAttempt, setRecentAttempt] = useState<Attempt | null>(initialRecentAttempt);

  const updateAttempts = useCallback((payload: { new: Attempt }, user: User, campaign_id: number, callsList: Call[]) => {
    if (payload.new.user_id !== user?.id || payload.new.campaign_id !== campaign_id) return;

    const calls = callsList.filter(
      (call) => call.outreach_attempt_id === payload.new.id && call.direction !== "outbound-api"
    );
    let updatedAttempt = updateAttemptWithCall(payload.new, calls[0]);

    setAttempts((currentAttempts) => {
      const index = currentAttempts.findIndex((item) => item.id === payload.new.id);
      return index > -1
        ? currentAttempts.map((item) => (item.id === payload.new.id ? updatedAttempt : item))
        : [...currentAttempts, updatedAttempt];
    });

    if (isRecent(updatedAttempt.created_at)) {
      setRecentAttempt(updatedAttempt);
    }
  }, []);

  return { attemptList, setAttempts, recentAttempt, setRecentAttempt, updateAttempts };
};
import { useState, useCallback, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useQueue } from "./useQueue";
import { useAttempts } from "./useAttempts";
import { useCalls } from "./useCalls";
import { usePhoneNumbers } from "./usePhoneNumbers";
import { isRecent } from "~/lib/utils";

export const useSupabaseRealtime = ({
  user,
  supabase,
  init,
  contacts,
  campaign_id,
  predictive = false,
  setQuestionContact,
  workspace,
  activeCall,
}: UseSupabaseRealtimeProps): UseSupabaseRealtimeResult => {
  const [disposition, setDisposition] = useState<string | null>(
    init.recentAttempt?.disposition || init.recentAttempt?.result?.status || null
  );
  const [nextRecipient, setNextRecipient] = useState<QueueItem | null>(init.nextRecipient);

  const {
    queue,
    setQueue,
    predictiveQueue,
    updateQueue,
    householdMap
  } = useQueue(init.queue, init.predictiveQueue, user, contacts);

  const {
    attemptList,
    setAttempts,
    recentAttempt,
    setRecentAttempt,
    updateAttempts
  } = useAttempts(init.attempts, init.recentAttempt);

  const {
    callsList,
    setCalls,
    recentCall,
    setRecentCall,
    pendingCalls,
    setPendingCalls,
    updateCalls
  } = useCalls(init.callsList, init.recentCall);

  const { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers } = usePhoneNumbers(init.phoneNumbers, workspace);

  useEffect(() => {
    const handleChange = (payload: any) => {
      switch (payload.table) {
        case "outreach_attempt":
          updateAttempts(payload, user, campaign_id, callsList);
          break;
        case "call":
          updateCalls(payload, queue, recentAttempt, setNextRecipient, setQuestionContact);
          break;
        case "campaign_queue":
          updateQueue(payload, nextRecipient, setNextRecipient, predictive);
          break;
        case "workspace_number":
          updateWorkspaceNumbers(payload);
          break;
      }
    };

    const subscription = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "*" },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase, updateAttempts, updateCalls, updateQueue, updateWorkspaceNumbers]);

  useEffect(() => {
    if (recentAttempt) {
      setDisposition(recentAttempt.disposition || recentAttempt.result?.status || null);
    }
  }, [recentAttempt]);

  return {
    queue,
    callsList,
    attemptList,
    recentCall,
    recentAttempt,
    setRecentAttempt,
    setQueue,
    predictiveQueue,
    phoneNumbers,
    disposition,
    setDisposition,
    nextRecipient,
    setNextRecipient,
    householdMap,
  };
};
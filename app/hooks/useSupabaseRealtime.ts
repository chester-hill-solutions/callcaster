import { useState, useCallback, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useQueue } from "./useQueue";
import { useAttempts } from "./useAttempts";
import { useCalls } from "./useCalls";
import { usePhoneNumbers } from "./usePhoneNumbers";
import { isRecent } from "~/lib/utils";
import { QueueItem, User, WorkspaceData } from "~/lib/types";
import { Database } from "~/lib/database.types";

type UseSupabaseRealtimeProps = {
  user: User;
  supabase: SupabaseClient<Database>;
  init: any;
  campaign_id: string;
  predictive: boolean;
  setQuestionContact: (contact: QueueItem) => void;
  workspace: string;
  setCallDuration: (duration: number) => void;
  setUpdate: (update: any) => void;
};

export const useSupabaseRealtime = ({
  user,
  supabase,
  init,
  campaign_id,
  predictive,
  setQuestionContact,
  workspace,
  setCallDuration,
  setUpdate,
}: UseSupabaseRealtimeProps) => {
  const {
    queue,
    setQueue,
    predictiveQueue,
    updateQueue,
    householdMap,
    nextRecipient,
    setNextRecipient,
  } = useQueue({
    initialQueue: init.queue,
    initialPredictiveQueue: init.predictiveQueue,
    user,
    isPredictive: predictive,
    campaign_id,
    setCallDuration,
  });

  const { attemptList, recentAttempt, setRecentAttempt, updateAttempts } =
    useAttempts(init.attempts, init.recentAttempt, nextRecipient);

  const { callsList, recentCall, updateCalls } = useCalls(
    init.callsList,
    init.recentCall,
    queue,
    setNextRecipient,
    predictive,
  );

  const { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers } =
    usePhoneNumbers(init.phoneNumbers, workspace);

  useEffect(() => {
    const handleChange = (payload: any) => {
      switch (payload.table) {
        case "outreach_attempt":
          updateAttempts(payload, user, campaign_id, callsList);
          break;
        case "call":
          updateCalls(
            payload,
            queue,
            recentAttempt,
            setNextRecipient,
            setQuestionContact,
            setRecentAttempt,
          );
          break;
        case "campaign_queue":
          updateQueue(payload);
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
        handleChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [
    callsList,
    campaign_id,
    nextRecipient,
    predictive,
    queue,
    recentAttempt,
    setNextRecipient,
    setQuestionContact,
    setRecentAttempt,
    setUpdate,
    supabase,
    updateAttempts,
    updateCalls,
    updateQueue,
    updateWorkspaceNumbers,
    user,
  ]);

  const handleSetDisposition = useCallback(
    (value: string) => {
      setRecentAttempt((cur) => ({
        ...cur,
        disposition: value,
      }));
    },
    [setRecentAttempt],
  );

  useEffect(() => {
    setQuestionContact(nextRecipient);
  }, [nextRecipient, setQuestionContact]);

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
    disposition: recentAttempt?.disposition || "idle",
    setDisposition: handleSetDisposition,
    nextRecipient,
    setNextRecipient,
    householdMap,
    setPhoneNumbers,
  };
};

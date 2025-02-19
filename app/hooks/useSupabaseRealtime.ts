import { useState, useCallback, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { useQueue } from "./useQueue";
import { useAttempts } from "./useAttempts";
import { useCalls } from "./useCalls";
import { usePhoneNumbers } from "./usePhoneNumbers";
import { QueueItem, User, OutreachAttempt, Call } from "~/lib/types";
import { Database } from "~/lib/database.types";

type RealtimeChangePayload = {
  table: string;
  schema: string;
  commit_timestamp: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, any>;
  old: Record<string, any>;
  errors: null | any[];
};

interface InitialState {
  queue: QueueItem[];
  predictiveQueue: QueueItem[];
  callsList: Call[];
  attempts: OutreachAttempt[];
  recentCall: Call | null;
  recentAttempt: OutreachAttempt | null;
  nextRecipient: QueueItem | null;
  phoneNumbers?: any;
  credits?: number;
}

interface UseSupabaseRealtimeProps {
  user: User;
  supabase: SupabaseClient<Database>;
  init: InitialState;
  campaign_id: string;
  predictive: boolean;
  setQuestionContact: (contact: QueueItem | null) => void;
  workspace?: string;
  setCallDuration: (duration: number) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
}

export const useSupabaseRealtimeSubscription = ({
  supabase,
  schema = "public",
  table,
  filter,
  onChange,
}: {
  supabase: SupabaseClient<Database>;
  schema?: string;
  table: string | string[];
  filter?: string;
  onChange: (payload: RealtimeChangePayload) => void;
}) => {
  useEffect(() => {
    const channel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        onChange
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [supabase, schema, table, filter, onChange]);
};

export const useSupabaseRealtime = ({
  user,
  supabase,
  init,
  campaign_id,
  predictive,
  setQuestionContact,
  workspace = '',
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
    useAttempts(init.attempts as OutreachAttempt[], init.recentAttempt as OutreachAttempt | null, nextRecipient as QueueItem | null);

  const { callsList, recentCall, updateCalls } = useCalls(
    init.callsList,
    init.recentCall,
    queue,
    setNextRecipient,
    predictive,
  );

  const { phoneNumbers, setPhoneNumbers, updateWorkspaceNumbers } =
    usePhoneNumbers(init.phoneNumbers, workspace);

    
  const [availableCredits, setAvailableCredits] = useState(init.credits || 0);
  const updateCredits = (payload: any) => {
    setAvailableCredits((prev: number) => prev + payload.new.amount);
  }


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
        case "transaction_history":
          updateCredits(payload);
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
      setRecentAttempt((cur: OutreachAttempt) => ({
        ...cur!,
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
    availableCredits
  };
};

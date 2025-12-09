import { useState, useCallback, useEffect, useRef } from "react";
import { SupabaseClient, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueue } from "~/hooks/queue/useQueue";
import { useAttempts } from "~/hooks/queue/useAttempts";
import { useCalls } from "~/hooks/queue/useCalls";
import { usePhoneNumbers } from "~/hooks/phone/usePhoneNumbers";
import { QueueItem, User as AppUser, OutreachAttempt, Call, Contact } from "~/lib/types";
import { Database, Tables } from "~/lib/database.types";
import { User as SupabaseUser } from "@supabase/supabase-js";

type RealtimeChangePayload<T extends Record<string, unknown> = Record<string, unknown>> = RealtimePostgresChangesPayload<T>;

interface InitialState {
  queue: QueueItem[];
  predictiveQueue: QueueItem[];
  callsList: Call[];
  attempts: OutreachAttempt[];
  recentCall: Call | null;
  recentAttempt: OutreachAttempt | null;
  nextRecipient: QueueItem | null;
  phoneNumbers?: Tables<"workspace_number">[];
  credits?: number;
}

interface UseSupabaseRealtimeProps {
  user: AppUser | SupabaseUser;
  supabase: SupabaseClient<Database>;
  init: InitialState;
  campaign_id: string | number;
  predictive: boolean;
  setQuestionContact: (contact: QueueItem | null) => void;
  workspace?: string;
  setCallDuration: (duration: number) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
}

/**
 * Hook for subscribing to Supabase realtime changes on specific tables
 * 
 * Creates a Supabase realtime subscription for one or more tables with optional filtering.
 * Automatically handles subscription lifecycle (subscribe on mount, unsubscribe on unmount).
 * 
 * @param params - Configuration object
 * @param params.supabase - Supabase client instance
 * @param params.schema - Database schema (defaults to "public")
 * @param params.table - Table name(s) to subscribe to (string or array of strings)
 * @param params.filter - Optional filter string for the subscription
 * @param params.onChange - Callback function called when changes occur
 * 
 * @example
 * ```tsx
 * useSupabaseRealtimeSubscription({
 *   supabase,
 *   table: 'campaign_queue',
 *   filter: 'campaign_id=eq.123',
 *   onChange: (payload) => {
 *     console.log('Queue updated:', payload);
 *   },
 * });
 * ```
 */
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
  // Memoize onChange callback to prevent unnecessary re-subscriptions
  const onChangeRef = useRef(onChange);
  
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const channel = supabase
      .channel("db-changes")
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema,
          table,
          ...(filter ? { filter } : {}),
        } as any,
        (payload: RealtimeChangePayload) => onChangeRef.current(payload)
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [supabase, schema, table, filter]); // Removed onChange from dependencies
};

/**
 * Main hook for managing campaign realtime data synchronization
 * 
 * Orchestrates multiple realtime subscriptions and hooks to manage campaign state including:
 * - Queue management (standard and predictive dialing)
 * - Outreach attempts tracking
 * - Call history and updates
 * - Phone numbers management
 * - Credits/transaction history
 * 
 * Automatically subscribes to multiple database tables and coordinates updates across
 * all campaign-related state. Handles INSERT events for attempts, calls, queue items,
 * phone numbers, and transaction history.
 * 
 * @param params - Configuration object
 * @param params.user - Current user (AppUser or SupabaseUser)
 * @param params.supabase - Supabase client instance
 * @param params.init - Initial state for all data structures
 * @param params.campaign_id - Campaign ID to filter subscriptions
 * @param params.predictive - Whether predictive dialing is enabled
 * @param params.setQuestionContact - Callback to set the current question contact
 * @param params.workspace - Workspace ID (optional, defaults to empty string)
 * @param params.setCallDuration - Callback to update call duration
 * @param params.setUpdate - Callback to set update data
 * 
 * @returns Object containing:
 *   - queue: Current queue items
 *   - callsList: List of all calls
 *   - attemptList: List of outreach attempts
 *   - recentCall: Most recent call
 *   - recentAttempt: Most recent outreach attempt
 *   - setRecentAttempt: Setter for recent attempt
 *   - setQueue: Setter for queue
 *   - predictiveQueue: Predictive dialing queue
 *   - phoneNumbers: Workspace phone numbers
 *   - disposition: Current attempt disposition
 *   - setDisposition: Setter for disposition
 *   - nextRecipient: Next recipient in queue
 *   - setNextRecipient: Setter for next recipient
 *   - householdMap: Map of household relationships
 *   - setPhoneNumbers: Setter for phone numbers
 *   - availableCredits: Current available credits
 * 
 * @example
 * ```tsx
 * const {
 *   queue,
 *   nextRecipient,
 *   recentCall,
 *   recentAttempt,
 *   setDisposition,
 * } = useSupabaseRealtime({
 *   user: currentUser,
 *   supabase,
 *   init: initialData,
 *   campaign_id: campaign.id,
 *   predictive: campaign.isPredictive,
 *   setQuestionContact: (contact) => setCurrentContact(contact),
 *   workspace: workspaceId,
 *   setCallDuration: (duration) => setDuration(duration),
 *   setUpdate: (update) => setUpdateData(update),
 * });
 * ```
 */
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
    user: user as SupabaseUser,
    isPredictive: predictive,
    campaign_id: String(campaign_id),
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
    usePhoneNumbers(init.phoneNumbers || [], workspace);

    
  const [availableCredits, setAvailableCredits] = useState(init.credits || 0);
  const updateCredits = useCallback((payload: RealtimePostgresChangesPayload<Tables<"transaction_history">>) => {
    if (payload.eventType === 'INSERT' && payload.new?.amount) {
      setAvailableCredits((prev: number) => prev + Number(payload.new.amount));
    }
  }, []);

  // Use refs to avoid re-subscribing when these values change
  const callsListRef = useRef(callsList);
  const queueRef = useRef(queue);
  const recentAttemptRef = useRef(recentAttempt);
  const campaignIdRef = useRef(campaign_id);
  const userRef = useRef(user);

  // Update refs when values change
  useEffect(() => {
    callsListRef.current = callsList;
  }, [callsList]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    recentAttemptRef.current = recentAttempt;
  }, [recentAttempt]);

  useEffect(() => {
    campaignIdRef.current = campaign_id;
  }, [campaign_id]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const handleChange = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const tableName = payload.table;
      switch (tableName) {
        case "outreach_attempt":
          if (payload.eventType === 'INSERT' && payload.new) {
            updateAttempts(
              { new: payload.new as OutreachAttempt },
              userRef.current as SupabaseUser,
              Number(campaignIdRef.current),
              callsListRef.current
            );
          }
          break;
        case "call":
          if (payload.eventType === 'INSERT' && payload.new) {
            updateCalls(
              { new: payload.new as Call },
              queueRef.current,
              recentAttemptRef.current,
              setNextRecipient,
              setQuestionContact,
              setRecentAttempt as (attempt: Tables<"outreach_attempt"> | null) => void,
            );
          }
          break;
        case "campaign_queue":
          if (payload.eventType === 'INSERT' && payload.new) {
            const queueItem = payload.new as Tables<"campaign_queue"> & { contact: Contact | null };
            if (queueItem.contact) {
              updateQueue({ new: queueItem as Tables<"campaign_queue"> & { contact: Contact } });
            }
          }
          break;
        case "workspace_number":
          updateWorkspaceNumbers({
            eventType: payload.eventType,
            old: payload.old as Tables<"workspace_number"> | null,
            new: payload.new as Tables<"workspace_number"> | null
          });
          break;
        case "transaction_history":
          updateCredits(payload as RealtimePostgresChangesPayload<Tables<"transaction_history">>);
          break;
      }
    };

    const subscription = supabase
      .channel("schema-db-changes")
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: '*' },
        handleChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Subscription successful - no need to log in production
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Failed to subscribe to schema-db-changes');
        } else if (status === 'TIMED_OUT') {
          console.error('Subscription to schema-db-changes timed out');
        } else if (status === 'CLOSED') {
          // Subscription closed - no need to log in production
        }
      });

    return () => {
      try {
        supabase.removeChannel(subscription);
      } catch (error) {
        console.error('Error removing subscription channel:', error);
      }
    };
  }, [
    supabase,
    updateAttempts,
    updateCalls,
    updateQueue,
    updateWorkspaceNumbers,
    updateCredits,
    setNextRecipient,
    setQuestionContact,
    setRecentAttempt,
  ]);

  const handleSetDisposition = useCallback(
    (value: string) => {
      setRecentAttempt((cur: OutreachAttempt | null) => ({
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

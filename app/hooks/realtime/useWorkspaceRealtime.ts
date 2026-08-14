import { useCallback, useEffect, useRef } from "react";
import { useCreditBalance } from "@/hooks/billing/useCreditBalance";
import { useQueue } from "@/hooks/queue/useQueue";
import { useAttempts } from "@/hooks/queue/useAttempts";
import { useCalls } from "@/hooks/queue/useCalls";
import { usePhoneNumbers } from "@/hooks/phone/usePhoneNumbers";
import { fetchCampaignQueueItemWithContact } from "@/lib/chats/messaging-client";
import { QueueItem, User as AppUser, OutreachAttempt, Call, Contact } from "@/lib/types";
import type { Tables } from "@/lib/db-types";
import { logger } from "@/lib/logger.client";
import {
  parseWorkspaceEventData,
  type PostgresChangePayload,
} from "@/lib/workspace-events.shared";

export { useWorkspaceEventSubscription } from "./useWorkspaceEventSubscription";

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

interface UseWorkspaceRealtimeProps {
  user: AppUser;
  init: InitialState;
  campaign_id: string | number;
  predictive: boolean;
  setQuestionContact: (contact: QueueItem | null) => void;
  workspace: string;
  setCallDuration: (duration: number) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
}

/**
 * Main hook for managing campaign realtime data synchronization via workspace SSE.
 */
export const useWorkspaceRealtime = ({
  user,
  init,
  campaign_id,
  predictive,
  setQuestionContact,
  workspace,
  setCallDuration,
}: UseWorkspaceRealtimeProps) => {
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

  const {
    credits: availableCredits,
    applyLedgerEntry: updateCredits,
    reconcileFromServer: reconcileCredits,
  } = useCreditBalance(init.credits || 0);

  const callsListRef = useRef(callsList);
  const queueRef = useRef(queue);
  const recentAttemptRef = useRef(recentAttempt);
  const campaignIdRef = useRef(campaign_id);
  const userRef = useRef(user);
  const workspaceRef = useRef(workspace);

  /**
   * @effect Keep a ref to the latest callsList so handleChange (used inside the SSE subscription's stable closure) reads current data instead of a stale render's value.
   * @effect-deps callsList (from useCalls; changes as calls are updated locally or via realtime)
   * @effect-side-effects none — updates callsListRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    callsListRef.current = callsList;
  }, [callsList]);

  /**
   * @effect Keep a ref to the latest queue so handleChange reads current data instead of a stale render's value.
   * @effect-deps queue (from useQueue; changes as the campaign queue is updated locally or via realtime)
   * @effect-side-effects none — updates queueRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  /**
   * @effect Keep a ref to the latest recentAttempt so handleChange reads current data instead of a stale render's value.
   * @effect-deps recentAttempt (from useAttempts; changes as outreach attempts are updated locally or via realtime)
   * @effect-side-effects none — updates recentAttemptRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    recentAttemptRef.current = recentAttempt;
  }, [recentAttempt]);

  /**
   * @effect Keep a ref to the latest campaign_id so handleChange filters incoming events against the current campaign instead of a stale render's value.
   * @effect-deps campaign_id (prop; identifies which campaign's rows to accept)
   * @effect-side-effects none — updates campaignIdRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    campaignIdRef.current = campaign_id;
  }, [campaign_id]);

  /**
   * @effect Keep a ref to the latest user so handleChange (and the updaters it calls) read current user data instead of a stale render's value.
   * @effect-deps user (prop; the agent/user object passed down from the route)
   * @effect-side-effects none — updates userRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /**
   * @effect Keep a ref to the latest workspace so handleChange filters workspace_number/transaction_history events against the current workspace instead of a stale render's value.
   * @effect-deps workspace (prop; identifies which workspace's rows to accept)
   * @effect-side-effects none — updates workspaceRef only
   * @effect-why-not-loader Local ref bookkeeping to avoid a stale closure inside handleChange; not data fetching.
   */
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const handleChange = (payload: PostgresChangePayload) => {
    const tableName = payload.table;
    switch (tableName) {
      case "outreach_attempt":
        if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && payload.new) {
          const attemptCampaignId = (payload.new as { campaign_id?: number }).campaign_id;
          if (Number(attemptCampaignId) !== Number(campaignIdRef.current)) return;
          updateAttempts(
            { new: payload.new as OutreachAttempt },
            userRef.current,
            Number(campaignIdRef.current),
            callsListRef.current,
          );
        }
        break;
      case "call":
        if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && payload.new) {
          const callCampaignId = (payload.new as { campaign_id?: number }).campaign_id;
          if (callCampaignId != null && Number(callCampaignId) !== Number(campaignIdRef.current)) {
            return;
          }
          updateCalls(
            {
              new: payload.new as Call,
              eventType: payload.eventType as "INSERT" | "UPDATE",
            },
            queueRef.current,
            recentAttemptRef.current,
            setNextRecipient,
            setQuestionContact,
            setRecentAttempt as (attempt: Tables<"outreach_attempt"> | null) => void,
          );
        }
        break;
      case "campaign_queue":
        if (
          payload.new &&
          Number((payload.new as { campaign_id?: number }).campaign_id) !==
            Number(campaignIdRef.current)
        ) {
          return;
        }
        if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && payload.new) {
          const queueItem = payload.new as Tables<"campaign_queue"> & { contact?: Contact | null };
          if (queueItem.contact) {
            updateQueue({ new: queueItem as Tables<"campaign_queue"> & { contact: Contact } });
            return;
          }

          void fetchCampaignQueueItemWithContact(
            campaignIdRef.current,
            queueItem.id,
          ).then(
            (data) => {
              if (data?.contact) {
                updateQueue({ new: data as Tables<"campaign_queue"> & { contact: Contact } });
                return;
              }

              const existingContact =
                queueRef.current.find((item) => item.id === queueItem.id)?.contact ?? null;
              if (existingContact) {
                updateQueue({
                  new: {
                    ...queueItem,
                    contact: existingContact,
                  } as Tables<"campaign_queue"> & { contact: Contact },
                });
              }
            },
            (err: unknown) =>
              logger.error("Failed to hydrate queue item from realtime payload", err),
          );
        }
        break;
      case "workspace_number":
        if (workspaceRef.current && payload.new) {
          const rowWorkspace = (payload.new as { workspace?: string }).workspace;
          if (rowWorkspace !== workspaceRef.current) return;
        }
        updateWorkspaceNumbers({
          eventType: payload.eventType,
          old: payload.old as Tables<"workspace_number"> | null,
          new: payload.new as Tables<"workspace_number"> | null,
        });
        break;
      case "transaction_history":
        if (workspaceRef.current && payload.new) {
          const rowWorkspace = (payload.new as { workspace?: string }).workspace;
          if (rowWorkspace !== workspaceRef.current) return;
        }
        updateCredits(payload);
        break;
      default:
        break;
    }
  };

  const handleChangeRef = useRef(handleChange);
  handleChangeRef.current = handleChange;

  /**
   * @effect Open an SSE connection to the workspace events endpoint and route postgres_change events (outreach_attempt, call, campaign_queue, workspace_number, transaction_history) to the appropriate local updater via handleChangeRef.
   * @effect-deps workspace (prop; a change means the campaign session moved to a different workspace and must resubscribe to that workspace's event stream)
   * @effect-side-effects subscription — opens an EventSource (SSE) connection on mount/workspace-change; removes the listener and closes the connection on cleanup
   * @effect-why-not-loader Live server-pushed queue/call/attempt/credit changes can't be modeled as a request/response loader; the connection must persist for the campaign session and fan out to multiple local updaters (updateQueue, updateCalls, updateAttempts, updateWorkspaceNumbers, updateCredits) as events arrive.
   */
  useEffect(() => {
    if (!workspace) return;

    const url = `/api/workspaces/${encodeURIComponent(workspace)}/events`;
    const eventSource = new EventSource(url);

    const onWorkspaceEvent = (message: MessageEvent<string>) => {
      try {
        const record = parseWorkspaceEventData(message.data);
        if (record.event_type !== "postgres_change") return;
        handleChangeRef.current(record.payload as PostgresChangePayload);
      } catch (error) {
        logger.error("Failed to handle campaign workspace SSE event", error);
      }
    };

    eventSource.addEventListener("workspace_event", onWorkspaceEvent);
    eventSource.onerror = () => {
      // Transient EventSource reconnects are normal (e.g. idle-timeout
      // recycling); the browser retries automatically. Matches the sibling
      // hook's level (useWorkspaceEventSubscription.ts) so this doesn't
      // scream ERROR for routine reconnects.
      logger.debug("Campaign workspace SSE connection interrupted; EventSource will retry");
    };

    return () => {
      eventSource.removeEventListener("workspace_event", onWorkspaceEvent);
      eventSource.close();
    };
  }, [workspace]);

  const handleSetDisposition = useCallback(
    (value: string) => {
      setRecentAttempt((cur: OutreachAttempt | null) => ({
        ...cur!,
        disposition: value,
      }));
    },
    [setRecentAttempt],
  );

  /**
   * @effect CANDIDATE-REMOVE: Pushes nextRecipient up to the parent via setQuestionContact whenever it changes.
   * @effect-deps nextRecipient (derived queue state from useQueue); setQuestionContact (parent-supplied setter)
   * @effect-side-effects none — calls the parent's setQuestionContact with the current nextRecipient
   * @effect-why-not-loader This isn't fetch/loader territory — it's the "adjust state based on a prop/state change" anti-pattern from the React docs (you-might-not-need-an-effect). nextRecipient is already derived local state (from useQueue); syncing it to a parent-owned setState on every change via an effect causes an extra render pass. It would likely be cleaner for the parent to own/derive questionContact directly, or for callers here to invoke setQuestionContact at the point nextRecipient is actually produced (inside useQueue/updateQueue/updateCalls) rather than reactively mirroring it. Left as-is per scope (annotate + flag only, not rewrite).
   */
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
    availableCredits,
    reconcileCredits,
  };
};

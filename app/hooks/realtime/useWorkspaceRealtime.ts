import { useState, useCallback, useEffect, useRef } from "react";
import { useQueue } from "@/hooks/queue/useQueue";
import { useAttempts } from "@/hooks/queue/useAttempts";
import { useCalls } from "@/hooks/queue/useCalls";
import { usePhoneNumbers } from "@/hooks/phone/usePhoneNumbers";
import { fetchCampaignQueueItemWithContact } from "@/lib/chats/messaging-client";
import { QueueItem, User as AppUser, OutreachAttempt, Call, Contact } from "@/lib/types";
import { Tables } from "@/lib/db-types";
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

  const [availableCredits, setAvailableCredits] = useState(init.credits || 0);
  const updateCredits = useCallback((payload: PostgresChangePayload) => {
    if (payload.eventType === "INSERT" && payload.new?.amount) {
      setAvailableCredits((prev: number) => prev + Number(payload.new!.amount));
    }
  }, []);

  const callsListRef = useRef(callsList);
  const queueRef = useRef(queue);
  const recentAttemptRef = useRef(recentAttempt);
  const campaignIdRef = useRef(campaign_id);
  const userRef = useRef(user);
  const workspaceRef = useRef(workspace);

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
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;

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

    const url = `/api/workspaces/${encodeURIComponent(workspace)}/events`;
    const eventSource = new EventSource(url);

    const onWorkspaceEvent = (message: MessageEvent<string>) => {
      try {
        const record = parseWorkspaceEventData(message.data);
        if (record.event_type !== "postgres_change") return;
        handleChange(record.payload as PostgresChangePayload);
      } catch (error) {
        logger.error("Failed to handle campaign workspace SSE event", error);
      }
    };

    eventSource.addEventListener("workspace_event", onWorkspaceEvent);
    eventSource.onerror = () => {
      logger.error("Campaign workspace SSE connection error");
    };

    return () => {
      eventSource.removeEventListener("workspace_event", onWorkspaceEvent);
      eventSource.close();
    };
  }, [
    workspace,
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
    availableCredits,
  };
};

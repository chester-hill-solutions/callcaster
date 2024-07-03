import { Database, Tables, Enums } from "~/lib/database.types";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type User = Tables<"user">;
type Contact = Tables<"contact">;
type Call = Tables<"call">;
type Attempt = Tables<"outreach_attempt">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type PhoneNumber = Tables<"workspace_number">;
type HouseholdMap = Record<string, QueueItem[]>;

interface UseSupabaseRealtimeProps {
  user: User;
  supabase: SupabaseClient;
  init: {
    queue: QueueItem[];
    predictiveQueue: QueueItem[];
    callsList: Call[];
    attempts: Attempt[];
    recentCall: Call | null;
    recentAttempt: Attempt | null;
    phoneNumbers: PhoneNumber[];
    nextRecipient: QueueItem | null;
  };
  contacts: Contact[];
  campaign_id: number;
  predictive: boolean;
  setQuestionContact: (contact: QueueItem | null) => void;
  workspace: string;
}

interface UseSupabaseRealtimeResult {
  queue: QueueItem[];
  callsList: Call[];
  attemptList: Attempt[];
  recentCall: Call | null;
  recentAttempt: Attempt | null;
  setRecentAttempt: (attempt: Attempt | null) => void;
  setQueue: (queue: QueueItem[]) => void;
  predictiveQueue: QueueItem[];
  phoneNumbers: PhoneNumber[];
  disposition?: string | null;
  setDisposition: (disposition: string | null) => void;
  nextRecipient: QueueItem | null;
  setNextRecipient: (nextRecipient: QueueItem | null) => void;
  householdMap:HouseholdMap;
}

export function useSupabaseRealtime({
  user,
  supabase,
  init,
  contacts,
  campaign_id,
  predictive = false,
  setQuestionContact,
  workspace,
}: UseSupabaseRealtimeProps): UseSupabaseRealtimeResult {
  const [queue, setQueue] = useState<QueueItem[]>(init.queue);
  const [predictiveQueue, setPredictiveQueue] = useState<QueueItem[]>(
    init.predictiveQueue,
  );
  const [callsList, setCalls] = useState<Call[]>(init.callsList);
  const [attemptList, setAttempts] = useState<Attempt[]>(init.attempts);
  const [recentCall, setRecentCall] = useState<Call | null>(init.recentCall);
  const [recentAttempt, setRecentAttempt] = useState<Attempt | null>(
    init.recentAttempt,
  );
  const [pendingCalls, setPendingCalls] = useState<Call[]>([]);
  const [isNextRecipientSet, setIsNextRecipientSet] = useState<boolean>(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>(
    init.phoneNumbers,
  );
  const [disposition, setDisposition] = useState<string | null>(
    init.recentAttempt?.disposition ||
      init.recentAttempt?.result?.status ||
      null,
  );
  const [nextRecipient, setNextRecipient] = useState<QueueItem | null>(
    init.nextRecipient,
  );
  const sortQueue = useCallback((queue: QueueItem[]): QueueItem[] => {
    return [...queue].sort((a, b) => {
      if (a.attempts !== b.attempts) {
        return b.attempts - a.attempts;
      }
      if (a.id !== b.id) {
        return a.id - b.id;
      }
      return a.queue_order - b.queue_order;
    });
  }, []);


  const householdMap = useMemo(() => {
    const sortedQueue = sortQueue(queue);
    return sortedQueue.reduce<Record<string, QueueItem[]>>(
      (acc, curr, index) => {
        if (curr?.contact?.address) {
          if (!acc[curr.contact.address]) {
            acc[curr.contact.address] = [];
          }
          acc[curr.contact.address].push(curr);
        } else {
          acc[`NO_ADDRESS_${index}`] = [curr];
        }
        return acc;
      },
      {},
    );
  }, [queue, sortQueue]);

  const isRecent = (date: string): boolean => {
    const created = new Date(date);
    const now = new Date();
    return (now.getTime() - created.getTime()) / 3600000 < 24;
  };

  const updateAttemptWithCall = (attempt: Attempt, call: Call): Attempt => {
    return {
      ...attempt,
      result: {
        ...attempt.result,
        ...(call && call.status &&
          call.direction !== "outbound-api" && { status: call.status }),
      },
    };
  };


  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const findContactById = (contactId: number): Contact | undefined => {
    return contacts.find((contact) => contact.id === contactId);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateQueueItem = (
    queueItem: Tables<"campaign_queue">,
    contact: Contact,
  ): QueueItem => {
    return { ...queueItem, contact };
  };
  const processPendingCalls = useCallback((attemptId: number) => {
    setPendingCalls((currentPendingCalls) => {
      const callsToProcess = currentPendingCalls.filter(
        (call) => call.outreach_attempt_id === attemptId,
      );
      const remainingCalls = currentPendingCalls.filter(
        (call) => call.outreach_attempt_id !== attemptId,
      );

      setAttempts((currentData) => {
        return currentData.map((item) =>
          item.id === attemptId
            ? {
                ...item,
                result: {
                  ...item.result,
                  calls: [...(item.result.calls || []), ...callsToProcess],
                },
              }
            : item,
        );
      });

      setCalls((currentCalls) => [...currentCalls, ...callsToProcess]);

      return remainingCalls;
    });
  }, []);

  const updateAttempts = useCallback(
    (payload: { new: Attempt }) => {
      if (
        payload.new.user_id !== user.id ||
        payload.new.campaign_id !== campaign_id
      )
        return;

      const calls = callsList.filter(
        (call) =>
          call.outreach_attempt_id === payload.new.id &&
          call.direction !== "outbound-api",
      );
      let updatedAttempt = updateAttemptWithCall(payload.new, calls[0]);

      setAttempts((currentAttempts) => {
        const index = currentAttempts.findIndex(
          (item) => item.id === payload.new.id,
        );
        return index > -1
          ? currentAttempts.map((item) =>
              item.id === payload.new.id ? updatedAttempt : item,
            )
          : [...currentAttempts, updatedAttempt];
      });

      processPendingCalls(payload.new.id);
      setRecentAttempt(
        isRecent(updatedAttempt.created_at) ? updatedAttempt : null,
      );
    },
    [callsList, processPendingCalls, user.id, campaign_id],
  );

  const updateCalls = useCallback(
    (payload: { new: Call }) => {
      const attemptId = payload.new.outreach_attempt_id;
      let updatedCall = payload.new;
      if (attemptId) {
        setAttempts((currentAttempts) => {
          return currentAttempts.map((item) =>
            item.id === attemptId
              ? updateAttemptWithCall(item, updatedCall)
              : item,
          );
        });

        setCalls((currentCalls) => [...currentCalls, updatedCall]);
        setRecentCall(
          recentAttempt?.contact_id === updatedCall.contact_id
            ? updatedCall
            : recentCall,
        );
        const newRecipient = queue.find(
          (item) => updatedCall.contact_id === item.contact_id,
        );
        setNextRecipient(newRecipient || null);
        setQuestionContact(newRecipient || null);
      } else if (payload.new.contact_id) {
        setPendingCalls((currentPendingCalls) => [
          ...currentPendingCalls,
          updatedCall,
        ]);
      }
    },
    [
      recentAttempt?.contact_id,
      recentCall,
      queue,
      setNextRecipient,
      setQuestionContact,
    ],
  );

  const updateQueue = useCallback(
    (payload: { new: Tables<"campaign_queue"> }) => {
      if (payload.new.status === "dequeued") {
        setQueue((currentQueue) => {
          const filteredQueue = currentQueue.filter(
            (item) => item.id !== payload.new.id,
          );
          if (
            nextRecipient &&
            nextRecipient.contact_id === payload.new.contact_id
          ) {
            const nextUncontacted = filteredQueue.find(
              (item) => item.attempts === 0,
            );
            setNextRecipient(nextUncontacted || filteredQueue[0] || null);
          }
          return filteredQueue;
        });
      } else if (payload.new.status === user.id) {
        const contact = findContactById(payload.new.contact_id);
        if (contact?.phone) {
          const newQueueItem = updateQueueItem(payload.new, contact);
          setQueue((currentQueue) => {
            const index = currentQueue.findIndex(
              (item) => item.id === payload.new.id,
            );
            return index > -1
              ? currentQueue.map((item) =>
                  item.id === payload.new.id ? newQueueItem : item,
                )
              : [...currentQueue, newQueueItem];
          });
          if (!nextRecipient) {
            setNextRecipient(newQueueItem);
          }
        }
      }
    },
    [
      user.id,
      nextRecipient,
      setNextRecipient,
      findContactById,
      updateQueueItem,
    ],
  );

  const updateWorkspaceNumbers = useCallback(
    (payload: { eventType: string; old: PhoneNumber; new: PhoneNumber }) => {
      if (payload.eventType === "DELETE") {
        setPhoneNumbers((currentNumbers) =>
          currentNumbers.filter((item) => item.id !== payload.old.id),
        );
      }
      if (payload.new.workspace !== workspace) return;
      setPhoneNumbers((currentNumbers) => {
        const index = currentNumbers.findIndex(
          (item) => item.id === payload.new.id,
        );
        return index > -1
          ? currentNumbers.map((item) =>
              item.id === payload.new.id ? payload.new : item,
            )
          : [...currentNumbers, payload.new];
      });
    },
    [workspace],
  );

  useEffect(() => {
    const handleChange = (payload: any) => {
      switch (payload.table) {
        case "outreach_attempt":
          updateAttempts(payload);
          break;
        case "call":
          updateCalls(payload);
          break;
        case "campaign_queue":
          updateQueue(payload);
          break;
        case "workspace_number":
          updateWorkspaceNumbers(payload);
          break;
        default:
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
    supabase,
    updateAttempts,
    updateCalls,
    updateQueue,
    updateWorkspaceNumbers,
  ]);

  useEffect(() => {
    if (pendingCalls.length) {
      pendingCalls.forEach((call) =>
        processPendingCalls(call.outreach_attempt_id),
      );
    }
  }, [pendingCalls, processPendingCalls]);

  useEffect(() => {
    if (nextRecipient?.contact) {
      const newRecentCall = callsList.find(
        (call) =>
          call.contact_id === nextRecipient.contact.id &&
          isRecent(call.date_created),
      );
      setRecentCall(newRecentCall || null);
    } else {
      setRecentCall(null);
    }
  }, [callsList, nextRecipient]);

  useEffect(() => {
    if (recentAttempt) {
      setDisposition(
        recentAttempt.disposition || recentAttempt.result?.status || null,
      );
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
    householdMap
  };
}

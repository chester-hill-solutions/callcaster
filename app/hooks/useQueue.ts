import { User } from "@supabase/supabase-js";
import { useState, useCallback, useEffect } from "react";
import { Tables } from "~/lib/database.types";
import { sortQueue, createHouseholdMap } from "~/lib/utils";
import { QueueItem } from "~/lib/types";

interface UseQueueProps {
  initialQueue: QueueItem[];
  initialPredictiveQueue: QueueItem[];
  user: User;
  isPredictive: boolean;
  campaign_id: string;
  setCallDuration: (time: number) => void;
}

export const useQueue = ({
  initialQueue,
  initialPredictiveQueue,
  user,
  isPredictive,
  setCallDuration,
}: UseQueueProps) => {
  const [queue, setQueue] = useState<QueueItem[]>(
    isPredictive
      ? initialPredictiveQueue.filter((item) => item.status === "queued")
      : initialQueue?.length > 0
        ? sortQueue(initialQueue)
        : [],
  );
  const [predictiveQueue, setPredictiveQueue] = useState<QueueItem[]>(
    initialPredictiveQueue,
  );
  const [householdMap, setHouseholdMap] = useState(createHouseholdMap(queue));
  const [nextRecipient, setNextRecipient] = useState<QueueItem | null>(() => {
    return !isPredictive && queue.length > 0 ? queue[0] : null;
  });

  const isDuplicate = useCallback((newItem: QueueItem, currentQueue: QueueItem[]) => {
    return currentQueue.some(item => item.contact_id === newItem.contact_id);
  }, []);

  const updateQueue = useCallback(
    (payload: { new: Tables<"campaign_queue"> & { contact: Contact } }) => {
      const newStatus = payload.new.status;
      const isRemoval =
        !isPredictive && newStatus !== "queued" && newStatus !== user.id || newStatus === "dequeued";

      setQueue((currentQueue) => {
        let updatedQueue = isRemoval
          ? [...currentQueue.filter((item) => item.id !== payload.new.id)]
          : [...currentQueue];

        if (payload.new.contact?.phone) {
          const newQueueItem = payload.new;

          if (isPredictive) {
            if (newStatus === user.id || newStatus === "queued") {
              if (!isDuplicate(newQueueItem, updatedQueue)) {
                updatedQueue = updatedQueue.length
                  ? sortQueue([...updatedQueue, newQueueItem])
                  : [newQueueItem];
                if (newStatus === user.id) {
                  setNextRecipient(newQueueItem);
                  setCallDuration(0);
                }
              }
            } else {
              updatedQueue = updatedQueue.filter((item) => item.id !== payload.new.id);
            }
          } else {
            if (newStatus === user.id) {
              updatedQueue = updatedQueue.filter(
                (item) => item.contact_id !== payload.new.contact_id,
              );
              updatedQueue = sortQueue([...updatedQueue, newQueueItem]);
              if (!nextRecipient) setNextRecipient(newQueueItem);
            }
          }
        }

        if (!isPredictive && isRemoval && nextRecipient?.contact_id === payload.new.contact_id) {
          const nextUncontacted = updatedQueue.find(
            (item) => item.attempts === 0,
          );
          setNextRecipient(nextUncontacted || updatedQueue[0] || null);
        }

        return updatedQueue;
      });

      if (isRemoval) {
        setPredictiveQueue((current) =>
          current.filter((item) => item.id !== payload.new.id),
        );
      }
    },
    [isPredictive, user?.id, nextRecipient, setCallDuration, isDuplicate],
  );

  useEffect(() => {
    setHouseholdMap(createHouseholdMap(queue));
  }, [queue]);

  useEffect(() => {
    if (!nextRecipient && queue.length > 0 && !isPredictive) {
      setNextRecipient(queue[0]);
    }
  }, [queue, nextRecipient, isPredictive]);

  return {
    queue,
    setQueue,
    predictiveQueue,
    setPredictiveQueue,
    updateQueue,
    householdMap,
    nextRecipient,
    setNextRecipient,
  };
};

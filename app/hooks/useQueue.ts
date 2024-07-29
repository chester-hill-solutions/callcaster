import { User } from "@supabase/supabase-js";
import { useState, useCallback, useEffect } from "react";
import { Tables } from "~/lib/database.types";
import { sortQueue, createHouseholdMap } from "~/lib/utils";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

interface UseQueueProps {
  initialQueue: QueueItem[];
  initialPredictiveQueue: QueueItem[];
  user: User;
  isPredictive: boolean;
  campaign_id: string;
}

export const useQueue = ({
  initialQueue,
  initialPredictiveQueue,
  user,
  isPredictive,
  campaign_id,
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

  const updateQueue = useCallback(
    (payload: { new: Tables<"campaign_queue"> & { contact: Contact } }) => {
      const newStatus = payload.new.status;
      const isRemoval =
        !isPredictive && newStatus !== "queued" && newStatus !== user.id;

      setQueue((currentQueue) => {
        let updatedQueue = isRemoval
          ? [...currentQueue.filter((item) => item.id !== payload.new.id)]
          : [...currentQueue];

        if (payload.new.contact?.phone) {
          const newQueueItem = payload.new;

          if (
            isPredictive &&
            (newStatus === user.id || newStatus === "queued")
          ) {
            updatedQueue = updateQueue.length
              ? sortQueue([...updatedQueue, newQueueItem])
              : [];
            if (newStatus === user.id) {
              setNextRecipient(newQueueItem);
            }
          } else if (!isPredictive && newStatus === user.id) {
            updatedQueue = sortQueue([
              ...updatedQueue.filter(
                (item) => item.contact_id !== payload.new.contact_id,
              ),
              newQueueItem,
            ]);
            if (!nextRecipient) setNextRecipient(newQueueItem);
          } else if (
            isPredictive &&
            !(newStatus === user.id || newStatus === "queued")
          ) {
            updatedQueue =  [...currentQueue.filter((item) => item.id !== payload.new.id)]
          }
        }

        if (isRemoval && nextRecipient?.contact_id === payload.new.contact_id) {
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
    [user, isPredictive, nextRecipient],
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

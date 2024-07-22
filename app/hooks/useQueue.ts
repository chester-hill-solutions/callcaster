import { User } from "@supabase/supabase-js";
import { useState, useCallback, useEffect } from "react";
import { Tables } from "~/lib/database.types";
import { Contact } from "~/lib/types";
import { sortQueue, createHouseholdMap } from "~/lib/utils";

export const useQueue = (
  initialQueue: QueueItem[], 
  initialPredictiveQueue: QueueItem[], 
  user: User, 
  contacts: Contact[],
  isPredictive: boolean,
  nextRecipient: QueueItem | null,
  setNextRecipient: (recipient: QueueItem | null) => void
) => {
  const [queue, setQueue] = useState<QueueItem[]>(
    isPredictive 
      ? initialPredictiveQueue.filter(item => item.status === "queued")
      : sortQueue(initialQueue)
  );
  const [predictiveQueue, setPredictiveQueue] = useState<QueueItem[]>(initialPredictiveQueue);
  const [householdMap, setHouseholdMap] = useState(createHouseholdMap(queue));

  const updateQueue = useCallback((
    payload: { new: Tables<"campaign_queue"> }, 
    currentNextRecipient: QueueItem | null, 
    setNextRecipient: (recipient: QueueItem | null) => void,
    isPredictive: boolean
  ) => {
    if (payload.new.status === "dequeued") {
      setQueue((currentQueue) => {
        const filteredQueue = currentQueue.filter((item) => item.id !== payload.new.id);
        if (currentNextRecipient && currentNextRecipient.contact_id === payload.new.contact_id) {
          const nextUncontacted = filteredQueue.find((item) => item.attempts === 0);
          setNextRecipient(nextUncontacted || filteredQueue[0] || null);
        }
        return filteredQueue;
      });
      
      setPredictiveQueue((currentPredictiveQueue) => 
        currentPredictiveQueue.filter((item) => item.id !== payload.new.id)
      );
    } else {
      setQueue((currentQueue) => {
        if (payload.new.status === user?.id) {
          const contact = contacts.find((c) => c.id === payload.new.contact_id);
          if (contact?.phone) {
            const newQueueItem = { ...payload.new, contact };
            const filteredQueue = currentQueue.filter((item) => item.contact_id !== payload.new.contact_id);
            if (!currentNextRecipient) setNextRecipient(newQueueItem);
            return sortQueue([...filteredQueue, newQueueItem]);
          }
        } else if (isPredictive && payload.new.status === "queued") {
          const contact = contacts.find((c) => c.id === payload.new.contact_id);
          if (contact?.phone) {
            const newQueueItem = { ...payload.new, contact };
            return sortQueue([...currentQueue, newQueueItem]);
          }
        }
        return currentQueue;
      });
    }
  }, [contacts, user, isPredictive]);

  useEffect(() => {
    setHouseholdMap(createHouseholdMap(queue));
  }, [queue]);

  useEffect(() => {
    if (!nextRecipient && queue.length > 0) {
      setNextRecipient(queue[0]);
    }
  }, [queue, nextRecipient, setNextRecipient]);

  return { queue, setQueue, predictiveQueue, setPredictiveQueue, updateQueue, householdMap };
};

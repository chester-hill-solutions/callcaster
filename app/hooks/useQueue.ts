import { useState, useCallback, useEffect } from "react";
import { sortQueue, createHouseholdMap } from "~/lib/utils";

export const useQueue = (
  initialQueue: QueueItem[], 
  initialPredictiveQueue: QueueItem[], 
  user: User, 
  contacts: Contact[],
  isPredictive: boolean
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
    nextRecipient: QueueItem | null, 
    setNextRecipient: (recipient: QueueItem | null) => void
  ) => {
    if (payload.new.status === "dequeued") {
      setQueue((currentQueue) => {
        const filteredQueue = currentQueue.filter((item) => item.id !== payload.new.id);
        if (nextRecipient && nextRecipient.contact_id === payload.new.contact_id) {
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
        if (!isPredictive && payload.new.status === user?.id) {
          const contact = contacts.find((c) => c.id === payload.new.contact_id);
          if (contact?.phone) {
            const newQueueItem = { ...payload.new, contact };
            const filteredQueue = currentQueue.filter((item) => item.contact_id !== payload.new.contact_id);
            if (!currentQueue.length) setNextRecipient(newQueueItem);
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

  return { queue, setQueue, predictiveQueue, setPredictiveQueue, updateQueue, householdMap };
};

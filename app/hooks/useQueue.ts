import { useState, useCallback, useEffect } from "react";
import { sortQueue, createHouseholdMap } from "~/lib/utils";

export const useQueue = (initialQueue: QueueItem[], initialPredictiveQueue: QueueItem[], user: User, contacts: Contact[]) => {
  const [queue, setQueue] = useState<QueueItem[]>(sortQueue(initialQueue));
  const [predictiveQueue, setPredictiveQueue] = useState<QueueItem[]>(initialPredictiveQueue);
  const [householdMap, setHouseholdMap] = useState(createHouseholdMap(queue));

  const updateQueue = useCallback((payload: { new: Tables<"campaign_queue"> }, nextRecipient: QueueItem | null, setNextRecipient: (recipient: QueueItem | null) => void, predictive: boolean) => {
    setQueue((currentQueue) => {
      if (payload.new.status === "dequeued") {
        const filteredQueue = currentQueue.filter((item) => item.id !== payload.new.id);
        if (nextRecipient && nextRecipient.contact_id === payload.new.contact_id) {
          const nextUncontacted = filteredQueue.find((item) => item.attempts === 0);
          setNextRecipient(nextUncontacted || filteredQueue[0] || null);
        }
        return filteredQueue;
      } else if (payload.new.status === user?.id) {
        const contact = contacts.find((c) => c.id === payload.new.contact_id);
        if (contact?.phone) {
          const newQueueItem = { ...payload.new, contact };
          const filteredQueue = currentQueue.filter((item) => item.contact_id !== payload.new.contact_id);
          if (!currentQueue.length && !predictive) setNextRecipient(newQueueItem);
          return sortQueue([...filteredQueue, newQueueItem]);
        }
      }
      return currentQueue;
    });
  }, [contacts, user]);

  useEffect(() => {
    setHouseholdMap(createHouseholdMap(queue));
  }, [queue]);

  return { queue, setQueue, predictiveQueue, updateQueue, householdMap };
};

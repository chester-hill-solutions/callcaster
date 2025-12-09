import { User } from "@supabase/supabase-js";
import { useState, useCallback, useEffect, useRef } from "react";
import { Tables } from "~/lib/database.types";
import { sortQueue, createHouseholdMap } from "~/lib/utils";
import { Contact, QueueItem } from "~/lib/types";

interface UseQueueProps {
  initialQueue: QueueItem[];
  initialPredictiveQueue: QueueItem[];
  user: User;
  isPredictive: boolean;
  campaign_id: string;
  setCallDuration: (time: number) => void;
}

/**
 * Hook for managing campaign queue state and updates
 * 
 * Handles both standard and predictive dialing queues, manages queue updates from realtime
 * subscriptions, tracks household relationships, and maintains the next recipient.
 * Automatically sorts and filters queue items based on status and dialing mode.
 * 
 * @param props - Configuration object
 * @param props.initialQueue - Initial queue items for standard dialing
 * @param props.initialPredictiveQueue - Initial queue items for predictive dialing
 * @param props.user - Current user (for filtering queue by user ID)
 * @param props.isPredictive - Whether predictive dialing mode is enabled
 * @param props.campaign_id - Campaign ID for queue filtering
 * @param props.setCallDuration - Callback to reset call duration when starting new call
 * 
 * @returns Object containing:
 *   - queue: Current queue items (filtered and sorted)
 *   - predictiveQueue: Full predictive queue items
 *   - householdMap: Map of household relationships for duplicate detection
 *   - nextRecipient: Next contact to call (first item in queue)
 *   - updateQueue: Function to update queue from realtime payload
 * 
 * @example
 * ```tsx
 * const {
 *   queue,
 *   nextRecipient,
 *   updateQueue
 * } = useQueue({
 *   initialQueue: queueItems,
 *   initialPredictiveQueue: predictiveItems,
 *   user: currentUser,
 *   isPredictive: false,
 *   campaign_id: campaign.id,
 *   setCallDuration: (time) => setDuration(time)
 * });
 * 
 * // Update queue from realtime subscription
 * updateQueue({ new: updatedQueueItem });
 * 
 * // Get next contact to call
 * if (nextRecipient) {
 *   console.log('Next contact:', nextRecipient.contact.phone);
 * }
 * ```
 */
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
  
  // Use ref to avoid including nextRecipient in updateQueue dependencies
  const nextRecipientRef = useRef(nextRecipient);
  
  useEffect(() => {
    nextRecipientRef.current = nextRecipient;
  }, [nextRecipient]);

  const isDuplicate = useCallback((newItem: QueueItem, currentQueue: QueueItem[]) => {
    return currentQueue.some(item => item.contact_id === newItem.contact_id);
  }, []);

  const updateQueue = useCallback(
    (payload: { new: Tables<"campaign_queue"> & { contact: Contact } }) => {
      // Validate payload
      if (!payload || !payload.new) {
        console.error('Invalid queue update payload: payload or payload.new is missing');
        return;
      }

      if (!payload.new.id) {
        console.error('Invalid queue update payload: payload.new.id is missing');
        return;
      }

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
              if (!nextRecipientRef.current) setNextRecipient(newQueueItem);
            }
          }
        }

        if (!isPredictive && isRemoval && nextRecipientRef.current?.contact_id === payload.new.contact_id) {
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
    [isPredictive, user?.id, setCallDuration, isDuplicate],
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

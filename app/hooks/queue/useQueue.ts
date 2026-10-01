import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Tables } from "@/lib/db-types";
import { sortQueue, createHouseholdMap } from "@/lib/utils";
import { QueueItem, User } from "@/lib/types";
import { logger } from "@/lib/logger.client";
import {
  getAssignedUserId,
  isDequeued,
  isQueued,
} from "@/lib/queue-status";

/**
 * What a queue update decided, applied by the caller outside any updater.
 *
 * `advanceTo` is `undefined` when the update does not touch the recipient and
 * `null` when it deliberately clears it. The two are not the same, so this
 * cannot collapse into a nullable field with a default.
 */
type QueueUpdatePlan = {
  nextQueue: QueueItem[];
  advanceTo: QueueItem | null | undefined;
  resetDuration: boolean;
  isRemoval: boolean;
};

/**
 * The predictive-dial branch of a queue update, as a pure function.
 *
 * Predictive rows are not assigned to an agent the way manual ones are, so this
 * differs from the standard branch: a row is admitted if it is queued *or*
 * assigned to this agent, and a row that is neither is dropped.
 */
function planPredictiveRow(
  currentQueue: QueueItem[],
  newQueueItem: QueueItem,
  assignedToMe: boolean,
  isDuplicate: (item: QueueItem, queue: QueueItem[]) => boolean,
): { nextQueue: QueueItem[]; advanceTo: QueueItem | null; resetDuration: boolean } {
  if (!assignedToMe && !isQueued(newQueueItem)) {
    return {
      nextQueue: currentQueue.filter((item) => item.id !== newQueueItem.id),
      advanceTo: null,
      resetDuration: false,
    };
  }
  if (isDuplicate(newQueueItem, currentQueue)) {
    return { nextQueue: currentQueue, advanceTo: null, resetDuration: false };
  }
  const nextQueue = currentQueue.length
    ? sortQueue([...currentQueue, newQueueItem])
    : [newQueueItem];
  return {
    nextQueue,
    // A newly assigned contact is the one the agent is about to call, so the
    // recipient moves to it and the call timer restarts.
    advanceTo: assignedToMe ? newQueueItem : null,
    resetDuration: assignedToMe,
  };
}

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
      ? initialPredictiveQueue.filter((item) => isQueued(item))
      : initialQueue?.length > 0
        ? sortQueue(initialQueue)
        : [],
  );
  const [predictiveQueue, setPredictiveQueue] = useState<QueueItem[]>(
    initialPredictiveQueue,
  );
  const householdMap = useMemo(() => createHouseholdMap(queue), [queue]);
  const [nextRecipient, setNextRecipient] = useState<QueueItem | null>(() => {
    return !isPredictive && queue.length > 0 ? (queue[0] ?? null) : null;
  });
  const effectiveNextRecipient =
    nextRecipient ?? (!isPredictive ? queue[0] ?? null : null);

  // Use ref to avoid including nextRecipient in updateQueue dependencies
  const nextRecipientRef = useRef(effectiveNextRecipient);

  /**
   * @effect Keep nextRecipientRef current so updateQueue can read the latest recipient without depending on it.
   * @effect-deps effectiveNextRecipient (re-syncs the ref whenever the computed recipient changes)
   * @effect-side-effects none — mutates a ref only; no DOM/subscription/fetch
   * @effect-why-not-loader Not data fetching — this is the standard "latest ref" pattern used to
   *   avoid stale closures in updateQueue's useCallback without widening its dependency array.
   */
  useEffect(() => {
    nextRecipientRef.current = effectiveNextRecipient;
  }, [effectiveNextRecipient]);

  const isDuplicate = useCallback((newItem: QueueItem, currentQueue: QueueItem[]) => {
    return currentQueue.some(item => item.contact_id === newItem.contact_id);
  }, []);

  /**
   * The queue as of the last committed render, plus any writes made during
   * this tick. `updateQueue` derives the next queue from this instead of from
   * a `setQueue` updater, because the side effects that hang off a queue
   * change cannot live inside an updater (see below). Reading a ref also means
   * two `updateQueue` calls in the same tick compose, which a ref would not
   * do if it were only synced in an effect — hence the synchronous write below.
   */
  const queueRef = useRef(queue);

  /**
   * @effect Re-sync the queue ref whenever the committed queue changes, so an
   * external `setQueue` (useCallScreen and useCampaignQueueFlow both hold one)
   * is picked up by the next `updateQueue`.
   * @effect-deps queue (the committed value)
   * @effect-side-effects none — mutates a ref only
   * @effect-why-not-loader Not data fetching — the ref exists so the queue can
   *   be read outside a state updater, which is what keeps that updater pure.
   */
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  /**
   * The next queue, and the recipient/duration changes that go with it.
   *
   * Pure: it reads no component state beyond the two refs passed in and calls
   * no setters. Everything it decides is returned, so the caller can apply the
   * state updates outside React's updater.
   */
  const planQueueUpdate = useCallback(
    (
      currentQueue: QueueItem[],
      currentRecipient: QueueItem | null,
      payload: { new: QueueItem },
    ): QueueUpdatePlan => {
      const assignedUserId = getAssignedUserId(payload.new);
      const isRemoval =
        (!isPredictive &&
          !isQueued(payload.new) &&
          assignedUserId !== user?.id) ||
        isDequeued(payload.new);

      let nextQueue = isRemoval
        ? [...currentQueue.filter((item) => item.id !== payload.new.id)]
        : [...currentQueue];

      let advanceTo: QueueItem | null = null;
      let resetDuration = false;

      if (payload.new.contact?.phone) {
        const newQueueItem = payload.new;
        const assigned = assignedUserId === user?.id;

        if (isPredictive) {
          const planned = planPredictiveRow(
            nextQueue,
            newQueueItem,
            assigned,
            isDuplicate,
          );
          nextQueue = planned.nextQueue;
          advanceTo = planned.advanceTo;
          resetDuration = planned.resetDuration;
        } else if (assigned) {
          // No explicit advance here, and deliberately so.
          // `effectiveNextRecipient` falls back to `queue[0]`, so when the queue
          // was empty the newly assigned contact becomes the recipient anyway;
          // when it was not empty, the old `!nextRecipientRef.current` guard
          // could not fire, because the ref was non-null either way. Setting it
          // unconditionally would change which contact a live call screen points
          // at — a product decision, not a purity fix. See #2156.
          nextQueue = sortQueue([
            ...nextQueue.filter(
              (item) => item.contact_id !== payload.new.contact_id,
            ),
            newQueueItem,
          ]);
        }
      }

      if (
        !isPredictive &&
        isRemoval &&
        currentRecipient?.contact_id === payload.new.contact_id
      ) {
        advanceTo =
          nextQueue.find((item) => item.attempts === 0) ??
          nextQueue[0] ??
          null;
      }

      return { nextQueue, advanceTo, resetDuration, isRemoval };
    },
    [isPredictive, user?.id, isDuplicate],
  );

  const updateQueue = useCallback(
    (payload: { new: QueueItem }) => {
      // Validate payload
      if (!payload || !payload.new) {
        logger.error('Invalid queue update payload: payload or payload.new is missing');
        return;
      }

      if (!payload.new.id) {
        logger.error('Invalid queue update payload: payload.new.id is missing');
        return;
      }

      const plan = planQueueUpdate(
        queueRef.current,
        nextRecipientRef.current,
        payload,
      );

      // Written synchronously so a second `updateQueue` in the same tick
      // composes with this one, exactly as the updater form used to.
      queueRef.current = plan.nextQueue;
      setQueue(plan.nextQueue);

      if (plan.advanceTo !== undefined) {
        setNextRecipient(plan.advanceTo);
      }
      if (plan.resetDuration) {
        setCallDuration(0);
      }

      if (plan.isRemoval) {
        setPredictiveQueue((current) =>
          current.filter((item) => item.id !== payload.new.id),
        );
      }
    },
    [planQueueUpdate, setCallDuration],
  );

  return {
    queue,
    setQueue,
    predictiveQueue,
    setPredictiveQueue,
    updateQueue,
    householdMap,
    nextRecipient: effectiveNextRecipient,
    setNextRecipient,
  };
};

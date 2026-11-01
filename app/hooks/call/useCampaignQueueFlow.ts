import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { handleContact, handleQueue } from "@/lib/callscreenActions";
import { advanceQueueEntry } from "@/lib/queue-advance-client";
import { toast } from "sonner";
import type { Call, Campaign, OutreachAttempt, QueueItem } from "@/lib/types";

type UseCampaignQueueFlowOptions = {
  campaign: Campaign | null | undefined;
  workspaceId: string;
  userId: string;
  questionContact: QueueItem | null;
  customerCallSid: string | null;
  isCurrentCustomer: () => boolean;
  groupByHousehold: boolean;
  queue: QueueItem[];
  householdMap: Record<string, QueueItem[]>;
  nextRecipient: QueueItem | null;
  attemptList: OutreachAttempt[];
  callsList: Call[];
  activeCallSid: string | undefined;
  hangUp: () => void;
  setQuestionContact: (contact: QueueItem | null) => void;
  setRecentAttempt: Dispatch<SetStateAction<OutreachAttempt | null>>;
  setUpdate: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  setNextRecipient: (recipient: QueueItem | null) => void;
  setQueue: Dispatch<SetStateAction<QueueItem[]>>;
};

export function useCampaignQueueFlow({
  campaign,
  workspaceId,
  userId,
  questionContact,
  customerCallSid,
  isCurrentCustomer,
  groupByHousehold,
  queue,
  householdMap,
  nextRecipient,
  attemptList,
  callsList,
  activeCallSid,
  hangUp,
  setQuestionContact,
  setRecentAttempt,
  setUpdate,
  setNextRecipient,
  setQueue,
}: UseCampaignQueueFlowOptions) {
  const pageScope = JSON.stringify([workspaceId, userId, campaign?.id]);
  const pageOwner = useMemo(() => ({ scope: pageScope, active: false, epoch: 0 }), [pageScope]);
  const scope = JSON.stringify([workspaceId, userId, campaign?.id, questionContact?.id, questionContact?.dispatch_generation, customerCallSid]);
  const owner = useMemo(() => ({ scope, active: false, posting: false, epoch: 0 }), [scope]);
  const [postingOwner, setPostingOwner] = useState<typeof owner | null>(null);
  /**
   * @effect Bind prefetched queue rows to their committed page.
   * @effect-deps pageOwner (actor, workspace and campaign).
   * @effect-side-effects Retire old page fetch replies; no network work starts here.
   * @effect-why-not-loader A user-requested batch can arrive after navigation.
   */
  useEffect(() => {
    pageOwner.active = true; pageOwner.epoch++;
    return () => { pageOwner.active = false; pageOwner.epoch++; };
  }, [pageOwner]);
  /**
   * @effect Bind queue acknowledgements to the committed page and selected call attempt.
   * @effect-deps owner (actor, workspace, campaign, queue snapshot and customer).
   * @effect-side-effects Retire late queue replies on cleanup; no queue writes.
   * @effect-why-not-loader Pending browser commands can outlive their selected contact.
   */
  useEffect(() => {
    owner.active = true; owner.epoch++;
    return () => { owner.active = false; owner.posting = false; owner.epoch++; };
  }, [owner]);
  const isCurrentQueue = useCallback(() => owner.active && isCurrentCustomer(), [owner, isCurrentCustomer]);

  const dequeue = useCallback(async ({ contact }: { contact: QueueItem }) => {
    if (!campaign || owner.posting || !isCurrentQueue() || contact.id !== questionContact?.id ||
      contact.dispatch_generation !== questionContact.dispatch_generation) return false;
    const epoch = owner.epoch;
    owner.posting = true; setPostingOwner(owner);
    const result = await advanceQueueEntry({ workspace_id: workspaceId, campaign_id: campaign.id,
      contact_id: contact.contact.id, queue_id: contact.id, dispatch_generation: contact.dispatch_generation,
      household: groupByHousehold, ...(customerCallSid ? { call_sid: customerCallSid } : {}) }, userId);
    if (!isCurrentQueue() || owner.epoch !== epoch) return false;
    owner.posting = false; setPostingOwner(null);
    if (!result.ok) { toast.error(result.error); return false; }
    if (result.advanceState !== "superseded")
      setQueue(current => current.filter(row => row.id !== contact.id || row.dispatch_generation !== contact.dispatch_generation));
    return true;
  }, [campaign, owner, isCurrentQueue, questionContact, workspaceId, groupByHousehold, customerCallSid, userId, setQueue]);

  const { switchQuestionContact, nextNumber } = handleContact({
    setQuestionContact,
    setRecentAttempt,
    setUpdate,
    setNextRecipient,
    attempts: attemptList,
    calls: callsList,
  });

  const fetchMore = useCallback(async (args: { householdMap: Record<string, QueueItem[]> }) => {
    if (!campaign || !pageOwner.active) return;
    const epoch = pageOwner.epoch;
    const batch = handleQueue({ campaign, workspaceId,
      setQueue: update => setQueue(current => pageOwner.active && pageOwner.epoch === epoch
        ? typeof update === "function" ? update(current) : update : current) });
    await batch.fetchMore(args);
  }, [campaign, workspaceId, pageOwner, setQueue]);

  const handleNextNumber = useCallback(
    (skipHousehold = false) => {
      if (activeCallSid) {
        hangUp();
      }
      nextNumber({
        skipHousehold,
        queue,
        householdMap,
        nextRecipient,
        groupByHousehold,
      });
      setUpdate(null);
    },
    [
      activeCallSid,
      hangUp,
      nextNumber,
      queue,
      householdMap,
      nextRecipient,
      groupByHousehold,
      setUpdate,
    ],
  );

  return {
    switchQuestionContact,
    handleNextNumber,
    dequeue,
    fetchMore,
    pending: postingOwner === owner,
    isCurrentQueue,
  };
}

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useFetcher } from "react-router";
import { handleContact, handleQueue } from "@/lib/callscreenActions";
import type { Call, Campaign, OutreachAttempt, QueueItem } from "@/lib/types";

type UseCampaignQueueFlowOptions = {
  campaign: Campaign | null | undefined;
  workspaceId: string;
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
  const queueFetcher = useFetcher<{ queueError?: boolean }>();

  const { switchQuestionContact, nextNumber } = handleContact({
    setQuestionContact,
    setRecentAttempt,
    setUpdate,
    setNextRecipient,
    attempts: attemptList,
    calls: callsList,
  });

  const { dequeue, fetchMore } = handleQueue({
    submit: queueFetcher.submit,
    groupByHousehold,
    campaign: campaign as Campaign,
    workspaceId,
    setQueue,
  });

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
    queueFetcher,
  };
}

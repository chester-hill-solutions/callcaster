import { useCallback } from "react";
import type { Call } from "@twilio/voice-sdk";
import type {
  Campaign,
  Contact,
  OutreachAttempt,
  QueueItem,
} from "@/lib/types";

type CallStateMachineSend = (action: { type: string }) => void;

type StartCallArgs = {
  contact: Contact;
  campaign: Campaign;
  user: { id: string };
  workspaceId: string;
  nextRecipient: QueueItem | null;
  recentAttempt: OutreachAttempt | null;
  selectedDevice: string | null;
};

type UseCampaignDialActionsOptions = {
  campaign: Campaign | null | undefined;
  deviceIsBusy: boolean;
  incomingCall: Call | null;
  deviceStatus: string;
  begin: () => void;
  startCall: (args: StartCallArgs) => void;
  nextRecipient: QueueItem | null;
  user: { id: string };
  workspaceId: string;
  recentAttempt: OutreachAttempt | null;
  selectedDevice: string;
};

export function useCampaignDialActions({
  campaign,
  deviceIsBusy,
  incomingCall,
  deviceStatus,
  begin,
  startCall,
  nextRecipient,
  user,
  workspaceId,
  recentAttempt,
  selectedDevice,
}: UseCampaignDialActionsOptions) {
  return useCallback(() => {
    if (!campaign) return;

    if (campaign.dial_type === "predictive") {
      if (deviceIsBusy || incomingCall || deviceStatus !== "Registered") {
        return;
      }
      begin();
    } else if (campaign.dial_type === "call") {
      if (!nextRecipient?.contact) return;

      startCall({
        contact: nextRecipient.contact,
        campaign,
        user,
        workspaceId,
        nextRecipient,
        recentAttempt,
        selectedDevice,
      });
    }
  }, [
    campaign,
    deviceIsBusy,
    incomingCall,
    deviceStatus,
    begin,
    startCall,
    nextRecipient,
    user,
    workspaceId,
    recentAttempt,
    selectedDevice,
  ]);
}

type UseCampaignDequeueActionsOptions = {
  campaign: Campaign | null | undefined;
  nextRecipient: QueueItem | null;
  send: CallStateMachineSend;
  setCallDuration: (duration: number) => void;
  handleDialButton: () => void;
  saveData: () => void;
  dequeue: (args: { contact: QueueItem }) => void;
  fetchMore: (args: { householdMap: Record<string, QueueItem[]> }) => Promise<void>;
  householdMap: Record<string, QueueItem[]>;
  handleNextNumber: (skipHousehold?: boolean) => void;
  setRecentAttempt: (attempt: OutreachAttempt | null) => void;
  setUpdate: (update: Record<string, unknown> | null) => void;
};

export function useCampaignDequeueActions({
  campaign,
  nextRecipient,
  send,
  setCallDuration,
  handleDialButton,
  saveData,
  dequeue,
  fetchMore,
  householdMap,
  handleNextNumber,
  setRecentAttempt,
  setUpdate,
}: UseCampaignDequeueActionsOptions) {
  return useCallback(() => {
    if (!campaign || !nextRecipient) return;

    if (campaign.dial_type === "predictive") {
      send({ type: "HANG_UP" });
      setCallDuration(0);
      handleDialButton();
      saveData();
    } else if (campaign.dial_type === "call") {
      saveData();
      dequeue({ contact: nextRecipient });
      fetchMore({ householdMap });
      handleNextNumber(campaign?.group_household_queue || false);
      send({ type: "HANG_UP" });
      setRecentAttempt(null);
      setUpdate({});
      setCallDuration(0);
    }
  }, [
    campaign,
    nextRecipient,
    send,
    setCallDuration,
    handleDialButton,
    saveData,
    dequeue,
    fetchMore,
    householdMap,
    handleNextNumber,
    setRecentAttempt,
    setUpdate,
  ]);
}

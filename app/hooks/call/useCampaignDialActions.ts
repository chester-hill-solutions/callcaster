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
  callState: string;
  begin: () => void;
  startCall: (args: StartCallArgs) => void;
  nextRecipient: QueueItem | null;
  user: { id: string };
  workspaceId: string;
  recentAttempt: OutreachAttempt | null;
  selectedDevice: string;
  send: (action: { type: string }) => void;
  /**
   * Resets the canonical call lifecycle for the new dial, in the same batch as
   * the FSM's START_DIALING. Without it the finished call's outcome (or this
   * contact's last attempt disposition) paints for one frame before the
   * FSM→lifecycle bridge effect can clear it — the residual flash left over
   * from #1220.
   */
  beginDial: () => void;
};

export function useCampaignDialActions({
  campaign,
  deviceIsBusy,
  incomingCall,
  deviceStatus,
  callState,
  begin,
  startCall,
  nextRecipient,
  user,
  workspaceId,
  recentAttempt,
  selectedDevice,
  send,
  beginDial,
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
      if (deviceIsBusy || incomingCall) return;
      if (callState === "dialing" || callState === "connected") return;

      send({ type: "START_DIALING" });
      beginDial();
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
    callState,
    begin,
    startCall,
    nextRecipient,
    user,
    workspaceId,
    recentAttempt,
    selectedDevice,
    send,
    beginDial,
  ]);
}

type UseCampaignDequeueActionsOptions = {
  campaign: Campaign | null | undefined;
  /**
   * The contact "Save and Next" records and dequeues. This is the call
   * screen's questionContact (who the script/disposition panel is currently
   * showing) — NOT the queue's nextRecipient pointer. hangup.action.server.ts
   * dequeues the just-finished contact's queue row as soon as the agent
   * hangs up, which collapses nextRecipient to the following queue item, or
   * to null once the queue empties, before the agent has recorded anything.
   * Gating "Save and Next" on nextRecipient made the button a no-op in
   * exactly that window (#1253); questionContact holds the right contact
   * until the agent saves or a new dial starts.
   */
  questionContact: QueueItem | null;
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
  questionContact,
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
    if (!campaign || !questionContact) return;

    if (campaign.dial_type === "predictive") {
      send({ type: "HANG_UP" });
      setCallDuration(0);
      handleDialButton();
      saveData();
    } else if (campaign.dial_type === "call") {
      saveData();
      dequeue({ contact: questionContact });
      fetchMore({ householdMap });
      handleNextNumber(campaign?.group_household_queue || false);
      // NEXT resets a finished call to idle; HANG_UP here parked the FSM in
      // "completed" even from idle, which the next dial then flashed (#1220).
      send({ type: "NEXT" });
      setRecentAttempt(null);
      setUpdate({});
      setCallDuration(0);
    }
  }, [
    campaign,
    questionContact,
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

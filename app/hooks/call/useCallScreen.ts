import { useCallback, useEffect, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useOutletContext,
  useRevalidator,
} from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  handleCall,
  handleConference,
} from "@/lib/callscreenActions";
import { useSupabaseRealtime, useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useSupabaseRoom from "@/hooks/call/useSupabaseRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";
import { useCallScreenDialogs } from "@/hooks/call/useCallScreenDialogs";
import { usePhoneVerification } from "@/hooks/call/usePhoneVerification";
import { useCallAudioControls } from "@/hooks/call/useCallAudioControls";
import { useCampaignQueueFlow } from "@/hooks/call/useCampaignQueueFlow";
import {
  buildHandleDequeueNext,
  buildHandleDialButton,
  useCampaignCallFlow,
} from "@/hooks/call/useCampaignCallFlow";
import { getCallSid } from "@/lib/twilio/twilio-call-adapter.client";
import type {
  AppUser,
  LoaderData,
  QueueItem,
  UseSupabaseRealtimeProps,
} from "@/lib/types";

export function useCallScreen() {
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
  const { state: navState } = useNavigation();
  const isBusy = navState !== "idle";
  const {
    campaign,
    attempts: initialAttempts,
    user,
    workspaceId,
    campaignDetails,
    credits,
    contacts,
    queue: initialQueue,
    nextRecipient: initialNextRecipient,
    initalCallsList,
    initialRecentCall,
    initialRecentAttempt,
    token,
    count,
    completed,
    isActive,
    hasAccess,
    verifiedNumbers,
  } = useLoaderData<LoaderData>();
  const revalidator = useRevalidator();
  useSupabaseRealtimeSubscription({
    supabase,
    table: "campaign",
    filter: campaign?.id ? `id=eq.${campaign.id}` : "id=eq.-1",
    onChange: () => revalidator.revalidate(),
  });

  const [questionContact, setQuestionContact] = useState<QueueItem | null>(initialNextRecipient);
  const [update, setUpdate] = useState<Record<string, unknown> | null>(null);
  const groupByHousehold = campaign?.group_household_queue || false;

  const dialogs = useCallScreenDialogs({
    hasScript: Boolean(campaignDetails?.script_id),
    isPredictive: campaign?.dial_type === "predictive",
  });

  const phoneVerification = usePhoneVerification({
    workspaceId,
    callerId: campaign?.caller_id,
  });

  const { state, context, send } = useCallState();
  const navigate = useNavigate();
  const {
    device,
    status: deviceStatus,
    activeCall,
    incomingCall,
    hangUp,
    answer,
    holdAndAnswer,
    callState,
    callDuration,
    setCallDuration,
    deviceIsBusy,
  } = useTwilioDevice(
    token,
    phoneVerification.selectedDevice,
    workspaceId,
    send as unknown as (action: { type: string }) => void,
  );

  const audioControls = useCallAudioControls({ device, activeCall });

  const {
    status: liveStatus,
    users: onlineUsers,
    predictiveState,
  } = useSupabaseRoom({
    supabase,
    workspace: workspaceId,
    campaign: campaign?.id,
    userId: user.id,
  });

  const {
    queue,
    setQueue,
    predictiveQueue,
    callsList,
    attemptList,
    recentCall,
    recentAttempt,
    availableCredits,
    setRecentAttempt,
    disposition,
    setDisposition,
    householdMap,
    nextRecipient,
    setNextRecipient,
  } = useSupabaseRealtime({
    user: user as unknown as AppUser,
    supabase,
    init: {
      predictiveQueue: campaign?.dial_type === "predictive" ? initialQueue : [],
      queue: campaign?.dial_type === "call" ? initialQueue : [],
      callsList: initalCallsList,
      attempts: initialAttempts,
      recentCall: initialRecentCall || null,
      recentAttempt: initialRecentAttempt || null,
      nextRecipient: initialNextRecipient || null,
      credits: credits || 0,
    },
    campaign_id: campaign?.id?.toString() || "",
    setQuestionContact,
    predictive: campaign?.dial_type === "predictive",
    setCallDuration,
    setUpdate,
  } as UseSupabaseRealtimeProps);

  const callSid = getCallSid(activeCall) ?? recentCall?.sid ?? null;

  const { displayState, displayColor } = useCampaignCallFlow({
    callSid,
    workspaceId,
    state,
    activeCall,
    recentAttemptDisposition: recentAttempt?.disposition,
    predictiveState,
    setDisposition,
    send: send as unknown as (action: { type: string }) => void,
  });

  const { begin, conference, setConference, creditsError: conferenceCreditsError } = useStartConferenceAndDial(
    {
      userId: user.id,
      campaignId: campaign?.id?.toString() || "",
      workspaceId,
      callerId: campaign?.caller_id || "",
      selectedDevice: phoneVerification.selectedDevice,
    },
  );

  const fetcher = useFetcher<{ creditsError?: boolean }>();
  const submit = fetcher.submit;
  const creditsError = fetcher.data?.creditsError || conferenceCreditsError;

  const { startCall } = handleCall({ submit });
  const { handleConferenceEnd } = handleConference({
    submit,
    begin,
  });

  const queueFlow = useCampaignQueueFlow({
    campaign: campaign ?? null,
    workspaceId,
    groupByHousehold,
    queue,
    householdMap,
    nextRecipient,
    attemptList,
    callsList,
    activeCallSid: getCallSid(activeCall),
    hangUp,
    setQuestionContact,
    setRecentAttempt,
    setUpdate,
    setNextRecipient,
    setQueue,
  });

  const { saveData, isSaving } = useDebouncedSave({
    update,
    recentAttempt,
    nextRecipient,
    campaign,
    workspaceId,
    disposition,
    toast: toast as unknown as {
      success: (message: React.ReactNode, data?: unknown) => string | number;
      error: (message: React.ReactNode, data?: unknown) => string | number;
      warning: (message: React.ReactNode, data?: unknown) => string | number;
    },
  });

  const handleResponse = useCallback(
    ({ blockId, value }: { blockId: string; value: string | string[] }) => {
      setUpdate((curr) => ({ ...curr, [blockId]: value }));
    },
    [],
  );

  const handleDialButton = useCallback(
    buildHandleDialButton({
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
      selectedDevice: phoneVerification.selectedDevice,
    }),
    [
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
      phoneVerification.selectedDevice,
    ],
  );

  const handleDequeueNext = useCallback(
    buildHandleDequeueNext({
      campaign,
      nextRecipient,
      send: send as unknown as (action: { type: string }) => void,
      setCallDuration,
      handleDialButton,
      saveData,
      dequeue: queueFlow.dequeue,
      fetchMore: queueFlow.fetchMore,
      householdMap,
      handleNextNumber: queueFlow.handleNextNumber,
      setRecentAttempt,
      setUpdate,
    }),
    [
      campaign,
      nextRecipient,
      send,
      setCallDuration,
      handleDialButton,
      saveData,
      queueFlow.dequeue,
      queueFlow.fetchMore,
      householdMap,
      queueFlow.handleNextNumber,
      setRecentAttempt,
    ],
  );

  const handleVoiceDrop = () => {
    const sid = getCallSid(activeCall);
    if (!sid) return;
    const formData = new FormData();
    formData.append("callId", sid);
    formData.append("workspaceId", workspaceId);
    formData.append("campaignId", campaign?.id?.toString() || "");

    submit(formData, {
      method: "POST",
      action: "/api/audiodrop",
    });
  };

  const requeueContacts = () => {
    if (!campaign?.id) return;
    const userId = user.id;
    const campaignId = campaign.id.toString();
    submit({ userId, campaignId }, {
      method: "DELETE",
      action: "/api/queues",
      encType: "application/json",
    });
  };

  const house = householdMap[nextRecipient?.contact?.address || ""];

  useEffect(() => {
    const handleKeypress = (e: KeyboardEvent) => {
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].includes(
        e.key,
      )
        ? audioControls.handleDTMF(e.key)
        : null;
    };

    window.addEventListener("keypress", handleKeypress);

    return () => window.removeEventListener("keypress", handleKeypress);
  }, [activeCall, audioControls.handleDTMF]);

  useEffect(() => {
    if (nextRecipient) {
      setQuestionContact(nextRecipient);
      send({ type: "NEXT" });
      setCallDuration(0);
    }
  }, [nextRecipient, send, setCallDuration]);

  useEffect(() => {
    if (predictiveState.contact_id && predictiveState.status) {
      const contact = queue.find(
        (c) => c.contact_id === predictiveState.contact_id,
      );
      if (contact) setNextRecipient(contact);

      switch (predictiveState.status) {
        case "dialing":
          send({ type: "START_DIALING" });
          break;
        case "connected":
          send({ type: "CONNECT" });
          break;
        case "completed":
        case "failed":
        case "no-answer":
          send({ type: "HANG_UP" });
          break;
        default:
          send({ type: "NEXT" });
      }
    }
    if (!predictiveState.contact_id && predictiveState.status === "dialing") {
      setUpdate(null);
    }
    if (
      predictiveState.contact_id !== nextRecipient?.contact_id &&
      predictiveState.status === "dialing"
    ) {
      setUpdate(null);
    }
  }, [
    predictiveState,
    contacts,
    send,
    queue,
    setNextRecipient,
    nextRecipient?.contact_id,
  ]);

  useEffect(() => {
    if (phoneVerification.selectedDevice !== "computer") {
      phoneVerification.handlePhoneDeviceSelection(
        phoneVerification.selectedDevice,
        audioControls.requestMicrophoneAccess,
      );
    }
  }, [phoneVerification.selectedDevice]);

  const currentState = {
    callState,
    deviceStatus,
    queue,
    nextRecipient,
    questionContact,
    update,
  };

  const creditState: "GOOD" | "WARNING" | "BAD" =
    availableCredits > queue.length ? "GOOD" :
      availableCredits > 0 && availableCredits < queue.length ? "WARNING" :
        "BAD";

  return {
    isBusy,
    campaign,
    count,
    completed,
    workspaceId,
    campaignDetails,
    credits,
    isActive,
    hasAccess,
    verifiedNumbers,
    stream: audioControls.stream,
    availableMicrophones: audioControls.availableMicrophones,
    availableSpeakers: audioControls.availableSpeakers,
    handleMicrophoneChange: audioControls.handleMicrophoneChange,
    handleSpeakerChange: audioControls.handleSpeakerChange,
    handleMuteMicrophone: audioControls.handleMuteMicrophone,
    isMicrophoneMuted: audioControls.isMicrophoneMuted,
    availableCredits,
    creditState,
    phoneConnectionStatus: phoneVerification.phoneConnectionStatus,
    selectedDevice: phoneVerification.selectedDevice,
    setSelectedDevice: phoneVerification.setSelectedDevice,
    isAddingNumber: phoneVerification.isAddingNumber,
    setIsAddingNumber: phoneVerification.setIsAddingNumber,
    newPhoneNumber: phoneVerification.newPhoneNumber,
    setNewPhoneNumber: phoneVerification.setNewPhoneNumber,
    handleVerifyNewNumber: phoneVerification.handleVerifyNewNumber,
    pin: phoneVerification.pin,
    hangUp,
    answer,
    holdAndAnswer,
    incomingCall,
    device,
    requeueContacts,
    navigate,
    isReportDialogOpen: dialogs.isReportDialogOpen,
    setReportDialog: dialogs.setReportDialog,
    handleDTMF: audioControls.handleDTMF,
    displayState,
    displayColor,
    callDuration,
    conference,
    setConference,
    deviceIsBusy,
    nextRecipient,
    activeCall,
    recentCall,
    handleVoiceDrop,
    handleConferenceEnd,
    disposition,
    setDisposition,
    recentAttempt,
    callState,
    handleDialButton,
    handleDequeueNext,
    house,
    switchQuestionContact: queueFlow.switchQuestionContact,
    attemptList,
    questionContact,
    handleResponse,
    update,
    saveData,
    householdMap,
    groupByHousehold,
    queue,
    predictiveQueue,
    handleNextNumber: queueFlow.handleNextNumber,
    fetchMore: queueFlow.fetchMore,
    isDialogOpen: dialogs.isDialogOpen,
    setDialog: dialogs.setDialog,
    isErrorDialogOpen: dialogs.isErrorDialogOpen,
    setErrorDialog: dialogs.setErrorDialog,
    currentState,
    creditsError,
  };
}

export type CallScreenLayoutProps = ReturnType<typeof useCallScreen>;

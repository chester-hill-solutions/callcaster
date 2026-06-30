import { useCallback, useEffect, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useOutletContext,
  useRevalidator,
} from "react-router";
import { toast } from "sonner";
import {
  handleCall,
  handleConference,
} from "@/lib/callscreenActions";
import { useWorkspaceRealtime, useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useCallRoom from "@/hooks/call/useCallRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";
import { useCallScreenDialogs } from "@/hooks/call/useCallScreenDialogs";
import { usePhoneVerification } from "@/hooks/call/usePhoneVerification";
import { useCallAudioControls } from "@/hooks/call/useCallAudioControls";
import { useCampaignQueueFlow } from "@/hooks/call/useCampaignQueueFlow";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";
import {
  useCampaignDequeueActions,
  useCampaignDialActions,
} from "@/hooks/call/useCampaignDialActions";
import { usePredictiveCallSync } from "@/hooks/call/usePredictiveCallSync";
import { useNextRecipientSync } from "@/hooks/call/useNextRecipientSync";
import { getCallSid } from "@/lib/twilio/twilio-call-adapter.client";
import { KEYPAD_KEYS } from "@/lib/dtmf";
import type {
  AppUser,
  LoaderData,
  QueueItem,
  UseWorkspaceRealtimeProps,
} from "@/lib/types";

export function useCallScreen() {
  const { client } = useOutletContext<{ }>();
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
  useWorkspaceEventSubscription({
    workspaceId,
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
    isMicMuted,
    setMicMuted,
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

  const audioControls = useCallAudioControls({
    device,
    activeCall,
    micCoordinator: { isMicMuted, setMicMuted },
  });

  const {
    status: liveStatus,
    users: onlineUsers,
    predictiveState,
  } = useCallRoom({
    client,
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
  } = useWorkspaceRealtime({
    user: user as unknown as AppUser,
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
    workspace: workspaceId,
  } as UseWorkspaceRealtimeProps);

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

  const handleDialButton = useCampaignDialActions({
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
  });

  const handleDequeueNext = useCampaignDequeueActions({
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
  });

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
      KEYPAD_KEYS.includes(e.key)
        ? audioControls.handleDTMF(e.key)
        : null;
    };

    window.addEventListener("keypress", handleKeypress);

    return () => window.removeEventListener("keypress", handleKeypress);
  }, [activeCall, audioControls.handleDTMF]);

  useNextRecipientSync({
    nextRecipient,
    send: send as unknown as (action: { type: string }) => void,
    setQuestionContact,
    setCallDuration,
  });

  usePredictiveCallSync({
    predictiveState,
    queue,
    nextRecipient,
    send: send as unknown as (action: { type: string }) => void,
    setNextRecipient,
    setUpdate,
  });

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

  const callControls = {
    hangUp,
    answer,
    holdAndAnswer,
    incomingCall,
    activeCall,
    callState,
    callDuration,
    deviceIsBusy,
    handleDialButton,
    handleDequeueNext,
    handleVoiceDrop,
    handleConferenceEnd,
    displayState,
    displayColor,
    conference,
    setConference,
    disposition,
    setDisposition,
    recentCall,
    recentAttempt,
    availableCredits,
    creditState,
  };

  const queueControls = {
    queue,
    predictiveQueue,
    nextRecipient,
    house,
    switchQuestionContact: queueFlow.switchQuestionContact,
    handleNextNumber: queueFlow.handleNextNumber,
    fetchMore: queueFlow.fetchMore,
    householdMap,
    groupByHousehold,
    requeueContacts,
  };

  const formState = {
    questionContact,
    attemptList,
    handleResponse,
    update,
    saveData,
    isSaving,
  };

  const dialogControls = {
    isDialogOpen: dialogs.isDialogOpen,
    setDialog: dialogs.setDialog,
    isErrorDialogOpen: dialogs.isErrorDialogOpen,
    setErrorDialog: dialogs.setErrorDialog,
    isReportDialogOpen: dialogs.isReportDialogOpen,
    setReportDialog: dialogs.setReportDialog,
  };

  const audioControlsGroup = {
    stream: audioControls.stream,
    availableMicrophones: audioControls.availableMicrophones,
    availableSpeakers: audioControls.availableSpeakers,
    handleMicrophoneChange: audioControls.handleMicrophoneChange,
    handleSpeakerChange: audioControls.handleSpeakerChange,
    handleMuteMicrophone: audioControls.handleMuteMicrophone,
    isMicrophoneMuted: audioControls.isMicrophoneMuted,
    handleDTMF: audioControls.handleDTMF,
    requestMicrophoneAccess: audioControls.requestMicrophoneAccess,
  };

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
    navigate,
    device,
    currentState,
    creditsError,
    callControls,
    queueControls,
    formState,
    dialogControls,
    audioControls: audioControlsGroup,
    phoneVerification,
  };
}

export type CallScreenLayoutProps = ReturnType<typeof useCallScreen>;

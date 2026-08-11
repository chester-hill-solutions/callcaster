import { useCallback, useEffect, useRef, useState } from "react";
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
import { useDialFailureRecovery } from "@/hooks/call/useDialFailureRecovery";
import { getCallSid } from "@/lib/twilio/twilio-call-params";
import { KEYPAD_KEYS } from "@/lib/dtmf";
import type {
  AppUser,
  LoaderData,
  QueueItem,
  UseWorkspaceRealtimeProps,
} from "@/lib/types";

export function useCallScreen() {
  useOutletContext<{ }>();
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
    featureFlags,
    initialCoaching,
  } = useLoaderData<LoaderData>();
  const revalidator = useRevalidator();
  const handleTokenWillExpire = useCallback(() => {
    revalidator.revalidate();
  }, [revalidator]);
  useWorkspaceEventSubscription({
    workspaceId,
    table: "campaign",
    filter: campaign?.id ? `id=eq.${campaign.id}` : "id=eq.-1",
    onChange: () => revalidator.revalidate(),
  });

  /**
   * @effect Periodically revalidate the call-screen loader data every 50
   * minutes so stale workspace/campaign info is refreshed during long sessions.
   * @effect-deps revalidator (re-subscribes when the revalidator instance changes)
   * @effect-side-effects timer (setInterval) + fetch (revalidator.revalidate);
   * cleared on unmount or revalidator change
   * @effect-why-not-loader Polling for client-side freshness; a loader
   * cannot self-schedule periodic re-fetches.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [revalidator]);

  const [questionContact, setQuestionContact] = useState<QueueItem | null>(initialNextRecipient);
  const [update, setUpdate] = useState<Record<string, unknown> | null>(null);
  const groupByHousehold = campaign?.group_household_queue || false;

  const dialogs = useCallScreenDialogs({
    hasScript: Boolean(campaignDetails?.script_id),
    isPredictive: campaign?.dial_type === "predictive",
  });

  const phoneVerification = usePhoneVerification({
    verifiedNumbers,
  });

  const { state, send } = useCallState();
  const navigate = useNavigate();
  const {
    device,
    status: deviceStatus,
    activeCall,
    incomingCall,
    isMicMuted,
    setMicMuted,
    hangUp: sdkHangUp,
    answer,
    holdAndAnswer,
    callState,
    callDuration,
    setCallDuration,
    deviceIsBusy,
    error: deviceError,
    reconnect: reconnectDevice,
  } = useTwilioDevice(
    token,
    phoneVerification.selectedDevice,
    workspaceId,
    send as unknown as (action: { type: string }) => void,
    handleTokenWillExpire,
  );

  // Wrap hangUp to drive lifecycle immediately before SDK teardown.
  // This ensures the display transitions to ending/ended synchronously,
  // even if the /api/hangup call or SDK disconnect is delayed.
  const hangUp = useCallback(async () => {
    send({ type: "HANG_UP" });
    try {
      await sdkHangUp();
    } catch {
      // SDK hangup failure is non-fatal; lifecycle already transitioned.
    }
  }, [sdkHangUp, send]);

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

  const agentLegSid = getCallSid(activeCall) ?? null;

  const { displayState, displayColor } = useCampaignCallFlow({
    callSid,
    agentLegSid,
    workspaceId,
    state,
    activeCall,
    recentAttemptDisposition: recentAttempt?.disposition,
    predictiveState,
    isPredictive: campaign?.dial_type === "predictive",
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

  const fetcher = useFetcher<{ creditsError?: boolean; error?: string }>();
  const submit = fetcher.submit;
  const creditsError =
    fetcher.data?.creditsError ||
    conferenceCreditsError ||
    availableCredits <= 0;

  useDialFailureRecovery({
    fetcherState: fetcher.state,
    fetcherData: fetcher.data,
    send,
    showError: (message) => toast.error(message),
  });

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
    // Autosave fires every 2s while the agent types mid-call; success toasts
    // would spam over the call UI. Errors still surface.
    silent: true,
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
    callState,
    begin,
    startCall,
    nextRecipient,
    user,
    workspaceId,
    recentAttempt,
    selectedDevice: phoneVerification.selectedDevice,
    send: send as unknown as (action: { type: string }) => void,
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

  const handleDTMFRef = useRef(audioControls.handleDTMF);
  handleDTMFRef.current = audioControls.handleDTMF;

  /**
   * @effect Let the physical/OS keyboard send DTMF digits during an active
   * call by listening for global keypress events matching the keypad keys.
   * @effect-deps [] — intentionally mount-once; the handler always calls
   * through handleDTMFRef (kept fresh every render just above), so it doesn't
   * need audioControls.handleDTMF in the deps to stay current.
   * @effect-side-effects dom (window "keypress" event listener), removed on
   * unmount.
   * @effect-why-not-loader DOM event subscription, not request/response data.
   */
  useEffect(() => {
    const handleKeypress = (e: KeyboardEvent) => {
      // Typing digits into a questionnaire field must not fire DTMF tones
      // into the live call.
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select") !== null)
      ) {
        return;
      }
      if (KEYPAD_KEYS.includes(e.key)) {
        handleDTMFRef.current(e.key);
      }
    };

    window.addEventListener("keypress", handleKeypress);

    return () => window.removeEventListener("keypress", handleKeypress);
  }, []);

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
    conference,
  });

  const handleDeviceSelect = useCallback(
    (device: string) => {
      void phoneVerification.handlePhoneDeviceSelection(
        device,
        audioControls.requestMicrophoneAccess,
      );
    },
    [phoneVerification, audioControls.requestMicrophoneAccess],
  );

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

  const resetCall = useCallback(() => {
    // hangUp wrapper already sends HANG_UP to the lifecycle.
    hangUp().catch(() => {});
    send({ type: "NEXT" });
    reconnectDevice();
  }, [hangUp, send, reconnectDevice]);

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
    deviceError,
    reconnectDevice,
    resetCall,
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
    selectedMicrophone: audioControls.microphone,
    selectedSpeaker: audioControls.output,
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
    credits: availableCredits,
    isActive,
    hasAccess,
    verifiedNumbers,
    navigate,
    device,
    currentState,
    creditsError,
    deviceError,
    callControls,
    queueControls,
    formState,
    dialogControls,
    audioControls: audioControlsGroup,
    phoneVerification: {
      ...phoneVerification,
      setSelectedDevice: handleDeviceSelect,
    },
    featureFlags,
    callSid,
    initialCoaching,
  };
}

export type CallScreenLayoutProps = ReturnType<typeof useCallScreen>;

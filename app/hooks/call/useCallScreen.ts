import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
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
  releaseCallSession,
} from "@/lib/callscreenActions";
import { useWorkspaceRealtime, useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useCallRoom from "@/hooks/call/useCallRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useCallEndTone } from "@/hooks/call/useCallEndTone";
import { useCallDuration } from "@/hooks/call/useCallDuration";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";
import { useCallScreenDialogs } from "@/hooks/call/useCallScreenDialogs";
import { usePhoneVerification } from "@/hooks/call/usePhoneVerification";
import { useAgentAudioConnection, useAgentBrowserReadiness } from "@/hooks/call/useAgentAudioConnection";
import { useManualAudioDial } from "@/hooks/call/useManualAudioDial";
import { useCustomerCallControls } from "@/hooks/call/useCustomerCallControls";
import { agentAudioStartReason, useCallScreenAudio } from "@/hooks/call/useCallScreenAudio";
import type { StartCallArgs } from "@/lib/manual-dial-client";
import { useCallAudioControls } from "@/hooks/call/useCallAudioControls";
import { useAudioDeviceTest } from "@/hooks/call/useAudioDeviceTest";

/**
 * Build the #1339 audio-test slice consumed by the settings sheet. Hoisted
 * out of useCallScreen so the branching stays out of the hook's cyclomatic
 * budget (the lint-ratchet caps that at 20).
 */
function buildAudioTestGroup(
  audioDeviceTest: ReturnType<typeof useAudioDeviceTest>,
  outputDeviceId: string | null,
) {
  const onToggleMicMonitor = () => {
    if (audioDeviceTest.isMicMonitoring) {
      audioDeviceTest.stopMicMonitor();
    } else {
      audioDeviceTest.startMicMonitor();
    }
  };
  return {
    onTestSpeaker: () => audioDeviceTest.playSpeakerTone(outputDeviceId),
    onToggleMicMonitor,
    micLevel: audioDeviceTest.micLevel,
    isMicMonitoring: audioDeviceTest.isMicMonitoring,
    isSpeakerPlaying: audioDeviceTest.isSpeakerPlaying,
    audioTestError: audioDeviceTest.error,
  };
}
import { useCampaignQueueFlow } from "@/hooks/call/useCampaignQueueFlow";
import { useCampaignCallFlow } from "@/hooks/call/useCampaignCallFlow";
import {
  TERMINAL_DISPLAY_STATES,
  useRemoteHangupReconcile,
} from "@/hooks/call/useRemoteHangupReconcile";
import {
  useCampaignDequeueActions,
  useCampaignDialActions,
} from "@/hooks/call/useCampaignDialActions";
import { usePredictiveCallSync } from "@/hooks/call/usePredictiveCallSync";
import { recoveredSubjectView, useRecoveredPredictiveSubject } from "@/hooks/call/useRecoveredPredictiveSubject";
import { useNextRecipientSync } from "@/hooks/call/useNextRecipientSync";
import { useDialFailureRecovery } from "@/hooks/call/useDialFailureRecovery";
import { useCreditReconciliation } from "@/hooks/billing/useCreditReconciliation";
import { getCallSid } from "@/lib/twilio/twilio-call-params";
import { KEYPAD_KEYS } from "@/lib/dtmf";
import { isObject } from "@/lib/type-safety-utils";
import type {
  AppUser,
  LoaderData,
  OutreachAttempt,
  QueueItem,
  UseWorkspaceRealtimeProps,
} from "@/lib/types";

function getSavedCallResult(
  attempt: OutreachAttempt | null,
  contact: QueueItem | null,
  campaignId: number | undefined,
  workspaceId: string,
): Record<string, unknown> | null {
  if (
    attempt?.contact_id !== contact?.contact.id ||
    attempt?.campaign_id !== campaignId ||
    attempt?.workspace !== workspaceId ||
    !isObject(attempt?.result)
  ) return null;
  return attempt.result;
}

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

  const [{ questionContact: storedQuestionContact, update }, setQuestionnaire] = useState<{
    questionContact: QueueItem | null;
    update: Record<string, unknown> | null;
  }>({ questionContact: initialNextRecipient, update: null });
  const setQuestionContact = useCallback((contact: QueueItem | null) => {
    setQuestionnaire((current) => current.questionContact === contact ? current : {
      questionContact: contact,
      update: current.questionContact?.contact.id === contact?.contact.id ? current.update : null,
    });
  }, []);
  const setUpdate = useCallback((next: SetStateAction<Record<string, unknown> | null>) => {
    setQuestionnaire((current) => {
      const nextUpdate = typeof next === "function" ? next(current.update) : next;
      return current.update === nextUpdate ? current : { ...current, update: nextUpdate };
    });
  }, []);
  const groupByHousehold = campaign?.group_household_queue || false;

  const dialogs = useCallScreenDialogs({
    hasScript: Boolean(campaignDetails?.script_id),
  });
  // Explicit Join (#1313): the welcome dialog's "Get started" flips this,
  // which is what gates Twilio device registration below. A campaign with no
  // script never shows the welcome dialog (the no-script error dialog takes
  // over instead) and would otherwise never register a device — the user has
  // no productive next step there anyway.
  const [hasJoined, setHasJoined] = useState(!dialogs.isDialogOpen);
  const onJoin = useCallback(() => setHasJoined(true), []);

  const phoneVerification = usePhoneVerification();
  const agentAudio = useAgentAudioConnection(workspaceId, user.id);
  const predictiveRecovery = campaign?.dial_type === "predictive" ? agentAudio.state.predictiveRecovery : null;
  const selectedDevice = agentAudio.state.selectedDevice;
  const { phoneSource, wantsBrowser } = agentAudio;
  const manualAudioDial = useManualAudioDial(workspaceId, user.id, campaign?.id ?? 0);
  const serverCustomerOwned = useRef(false);
  const onServerCustomerOwned = useCallback((owned: boolean) => { serverCustomerOwned.current = owned; }, []);
  const managesCustomerAudio = useCallback(() => serverCustomerOwned.current || agentAudio.resource.managesCustomerAudio(), [agentAudio.resource]);
  const savedManual = agentAudio.state.manualRecovery;
  const manualRecovery = savedManual?.workspace_id === workspaceId && savedManual.user_id === user.id && savedManual.campaign_id === campaign?.id ? savedManual : null;

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
    hasOwnedCalls,
    hasHeldCalls,
    error: deviceError,
    reconnect: reconnectDevice,
  } = useTwilioDevice({
    token,
    selectedDevice,
    workspaceId,
    send: send as unknown as (action: { type: string }) => void,
    onTokenWillExpire: handleTokenWillExpire,
    enabled: hasJoined && wantsBrowser,
    managesCustomerAudio,
  });

  const browserAudioEnabled = hasJoined && (wantsBrowser || hasOwnedCalls);
  const audioControls = useCallAudioControls({
    enabled: browserAudioEnabled,
    device,
    activeCall,
    micCoordinator: { isMicMuted, setMicMuted },
  });

  // #1339: opt-in "test my mic / speaker" affordances for the settings
  // sheet. Keyed on the live mic stream from useCallAudioControls so the
  // meter reflects the same input the call will use.
  const audioDeviceTest = useAudioDeviceTest({ stream: audioControls.stream, enabled: browserAudioEnabled });
  useAgentBrowserReadiness(agentAudio.resource, agentAudio.state.preparingBrowser, deviceStatus === "Registered", audioControls.inputReady);

  const showStartError = useCallback((message: string, creditFailure: boolean) => {
    if (creditFailure) {
      toast.error(hasAccess
        ? "Add credits to start dialing, then try again."
        : "Contact a workspace administrator to add credits, then try again.", {
        action: hasAccess ? {
          label: "Add credits",
          onClick: () => navigate(`/workspaces/${workspaceId}/billing`),
        } : undefined,
      });
      return;
    }
    toast.error(message);
  }, [hasAccess, navigate, workspaceId]);

  const { begin, conference, setConference, isLoading: isStartingConference, disabledReason: startDisabledReason,
    awaitingReceipt: awaitingStartReceipt, pendingStartIntentId, stop: handleConferenceEnd,
    stopPending: dialerStopPending, isStopping: isStoppingDialer, error: dialerError, hasSession: hasDialerSession } = useStartConferenceAndDial(
    {
      userId: user.id,
      campaignId: campaign?.id?.toString() || "",
      workspaceId,
      callerId: campaign?.caller_id || "",
      selectedDevice,
      audioSource: phoneSource,
      showError: showStartError,
      recovery: predictiveRecovery,
      dialerRecovery: campaign?.dial_type === "predictive" ? agentAudio.state.dialerRecovery : null,
      currentVerified: agentAudio.state.currentVerified && !agentAudio.state.restoring,
    },
  );

  const {
    status: liveStatus,
    users: onlineUsers,
    predictiveState,
    customerCallSid: joinedCustomerSid,
    recoveredCustomer,
  } = useCallRoom({
    workspace: workspaceId,
    campaign: campaign?.id,
    userId: user.id,
    conference,
    recovery: predictiveRecovery,
  });

  const {
    queue,
    setQueue,
    predictiveQueue,
    callsList,
    attemptList,
    recentCall,
    recentAttempt: realtimeRecentAttempt,
    availableCredits,
    setRecentAttempt,
    disposition: realtimeDisposition,
    setDisposition,
    householdMap,
    nextRecipient: realtimeNextRecipient,
    setNextRecipient,
    reconcileCredits,
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

  const recoveredSubject = useRecoveredPredictiveSubject(recoveredCustomer ?? null, attemptList, realtimeRecentAttempt);
  const predictiveView = recoveredSubjectView(recoveredSubject,
    { nextRecipient: realtimeNextRecipient, questionContact: storedQuestionContact, recentAttempt: realtimeRecentAttempt,
      disposition: realtimeDisposition, update });

  const agentLegSid = getCallSid(activeCall) ?? null;

  const { displayState, displayColor, beginDial, terminalCallSid, customerCallSid, isCurrentCustomer, confirmCustomerEnded, recoveredManual, retireManualRecovery } = useCampaignCallFlow({
    callSid: campaign?.dial_type === "predictive" ? joinedCustomerSid : managesCustomerAudio() ? null : agentLegSid,
    confirmedCustomerSid: campaign?.dial_type === "predictive" ? joinedCustomerSid : null,
    manualRecovery, allowManualRecovery: manualRecovery ? manualAudioDial.resource.ownsRecovery(manualRecovery) : false, onServerCustomerOwned,
    agentLegSid: agentAudio.state.active?.callSid ?? agentLegSid,
    workspaceId,
    state,
    activeCall: managesCustomerAudio() ? null : activeCall,
    recentAttemptDisposition: predictiveView.recentAttempt?.disposition,
    predictiveState,
    isPredictive: campaign?.dial_type === "predictive",
    send: send as unknown as (action: { type: string }) => void,
  });
  const manualSubject = useRecoveredPredictiveSubject(recoveredManual, attemptList, realtimeRecentAttempt);
  const { nextRecipient, questionContact, recentAttempt, disposition, update: ownedUpdate } = recoveredSubjectView(manualSubject, predictiveView);
  const boundManualSubject = useRef("");
  /**
   * @effect Bind the confirmed manual questionnaire subject before accepting new edits.
   * @effect-deps manualSubject.key, manualSubject.contact, manualSubject.attempt, setQuestionContact, setRecentAttempt, setUpdate (one confirmed attempt).
   * @effect-side-effects Questionnaire state; no save or queue write.
   * @effect-why-not-loader The saved call owner arrives after current discovery.
   */
  useEffect(() => {
    if (!manualSubject.contact || !manualSubject.attempt || boundManualSubject.current === manualSubject.key) return;
    boundManualSubject.current = manualSubject.key;
    setQuestionContact(manualSubject.contact); setRecentAttempt(manualSubject.attempt); setUpdate(null);
  }, [manualSubject.key, manualSubject.contact, manualSubject.attempt, setQuestionContact, setRecentAttempt, setUpdate]);
  /**
   * @effect Reconcile a lost manual POST reply only after its customer has been adopted.
   * @effect-deps recoveredManual, isCurrentCustomer, manualAudioDial.resource (committed customer and saved request).
   * @effect-side-effects Clear matching browser journal; no provider command.
   * @effect-why-not-loader The request journal belongs to this browser page.
   */
  useEffect(() => {
    if (recoveredManual && isCurrentCustomer()) manualAudioDial.resource.confirmRecovered(recoveredManual);
  }, [recoveredManual, isCurrentCustomer, manualAudioDial.resource]);
  const callSid = customerCallSid;
  const logicalDuration = useCallDuration(displayState);
  const liveCustomer = displayState === "dialing" || displayState === "connected";
  const dialerNeedsStop = dialerStopPending || hasDialerSession && !conference && !awaitingStartReceipt;
  const pendingCallRequest = Boolean(pendingStartIntentId) || dialerNeedsStop || manualAudioDial.state.pending;
  const customerRecoveryPending = agentAudio.state.customerPending && !callSid && !conference && !pendingCallRequest;
  const audioStartDisabledReason = agentAudioStartReason({ joined: hasJoined, ready: agentAudio.ready,
    pendingCustomer: agentAudio.state.customerPending || pendingCallRequest || Boolean(manualAudioDial.state.error),
    roomPending: Boolean(conference) && agentAudio.state.customerPending && !callSid,
    selectedDevice, deviceStatus, hasPhoneSource: Boolean(phoneSource) });

  const { hangUp, canControlCustomer } = useCustomerCallControls({
    userId: user.id, workspaceId, campaignId: campaign?.id, callSid,
    isPredictive: campaign?.dial_type === "predictive", activeCall, sdkHangUp, send,
    isCurrentCustomer, confirmCustomerEnded, managesCustomerAudio, onHangUp: retireManualRecovery,
  });

  // Two short busy-style bursts when the call ends — either side hanging up —
  // so the agent gets audible confirmation, not just the status text (#1363).
  useCallEndTone({
    enabled: selectedDevice === "computer",
    displayState,
    outputDeviceId: audioControls.output,
  });

  // A missed ledger SSE event would leave the credit display stale after a
  // billable call — converge on the server balance within 30s (#1234).
  useCreditReconciliation({
    workspaceId,
    isTerminal: TERMINAL_DISPLAY_STATES.has(displayState),
    credits: availableCredits,
    reconcile: reconcileCredits,
  });

  // If the contact hangs up first the agent leg can linger connected while
  // the strip already reads "Call Completed"; drop it so Dial returns (#1292).
  useRemoteHangupReconcile({
    displayState,
    callState,
    isPredictive: campaign?.dial_type === "predictive" || managesCustomerAudio(),
    terminalCallSid,
    hangUp,
  });

  const fetcher = useFetcher<{ creditsError?: boolean; error?: string }>();
  const submit = fetcher.submit;
  const creditsError =
    fetcher.data?.creditsError ||
    availableCredits <= 0;

  useDialFailureRecovery({
    fetcherState: fetcher.state,
    fetcherData: fetcher.data,
    send,
    showError: (message) => toast.error(message),
  });

  const { startCall: startLegacyCall } = handleCall({ submit });
  const startCall = (args: StartCallArgs) => {
    if (args.audioSource) void manualAudioDial.resource.begin(args);
    else startLegacyCall(args);
  };

  const queueFlow = useCampaignQueueFlow({
    campaign: campaign ?? null,
    workspaceId,
    userId: user.id,
    questionContact,
    customerCallSid,
    isCurrentCustomer,
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

  const currentUpdate = ownedUpdate ?? getSavedCallResult(
    recentAttempt, questionContact, campaign?.id, workspaceId,
  );
  const { saveData, isSaving } = useDebouncedSave({
    update: currentUpdate,
    recentAttempt,
    questionContact,
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
      setUpdate((curr) => ({ ...(curr ?? currentUpdate), [blockId]: value }));
    },
    [currentUpdate, setUpdate],
  );

  const handleDialButton = useCampaignDialActions({
    campaign,
    deviceIsBusy: queueFlow.pending || hasHeldCalls || (deviceIsBusy && !(agentAudio.state.active?.transport === "computer" && agentAudio.state.active.callSid === agentLegSid)),
    incomingCall,
    deviceStatus,
    callState: displayState,
    begin,
    startCall,
    nextRecipient,
    user,
    workspaceId,
    recentAttempt,
    selectedDevice,
    audioSource: phoneSource,
    audioReady: agentAudio.ready && !agentAudio.state.customerPending && !pendingCallRequest && !manualAudioDial.state.error &&
      (selectedDevice === "computer" ? deviceStatus === "Registered" : Boolean(phoneSource)),
    send: send as unknown as (action: { type: string }) => void,
    beginDial,
  });

  const handleDequeueNext = useCampaignDequeueActions({
    campaign,
    questionContact,
    send: send as unknown as (action: { type: string }) => void,
    setCallDuration,
    handleDialButton,
    saveData,
    dequeue: queueFlow.dequeue,
    isCurrentQueue: queueFlow.isCurrentQueue,
    fetchMore: queueFlow.fetchMore,
    householdMap,
    handleNextNumber: queueFlow.handleNextNumber,
    setRecentAttempt,
    setUpdate,
  });

  const handleVoiceDrop = () => {
    if (!callSid || !canControlCustomer()) return;
    const formData = new FormData();
    formData.append("callId", callSid);
    formData.append("workspaceId", workspaceId);
    formData.append("campaignId", campaign?.id?.toString() || "");

    submit(formData, {
      method: "POST",
      action: "/api/audiodrop",
    });
  };

  const requeueContacts = async () => {
    if (!campaign?.id) throw new Error("Campaign is required to release contacts");
    await releaseCallSession(campaign.id);
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
    // Keep the just-called contact on screen through dialing, the live call,
    // and the terminal outcome until the agent hands off (Save and Next /
    // beginDial reset displayState to idle). Predictive mode always advances —
    // the system pushing the next contact IS the flow there (#1458).
    holdAdvance:
      recoveredSubject.owns || manualSubject.owns || campaign?.dial_type !== "predictive" && displayState !== "idle",
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
    setConference,
    recoveredSubject,
    setQuestionContact,
    setRecentAttempt,
  });

  const screenAudio = useCallScreenAudio({ audio: agentAudio, hasJoined, workspaceId, verifiedNumbers,
    customerSid: liveCustomer ? callSid : null, agentSid: agentLegSid,
    customerPending: pendingCallRequest || (agentAudio.state.customerPending && !liveCustomer) || (liveCustomer && !callSid), browserEnabled: wantsBrowser,
    browserError: audioControls.permissionError ?? audioControls.inputError ?? deviceError?.message ?? null,
    requestMicrophone: audioControls.requestMicrophoneAccess, reconnect: () => { if (!hasOwnedCalls) reconnectDevice(); } });

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
    isAdvancingQueue: queueFlow.pending,
    awaitingCustomerReceipt: (manualAudioDial.state.pending && !callSid) || Boolean(pendingStartIntentId) || customerRecoveryPending,
    manualDialError: manualAudioDial.state.error ?? (dialerStopPending ? dialerError ?? "Stop is pending. Stay on this screen until it is confirmed."
      : dialerError ?? (awaitingStartReceipt ? "The dialer request is not confirmed. Check this request before starting another session."
      : customerRecoveryPending ? "An existing call needs confirmation. Check the call before dialing another contact." : manualSubject.error ?? recoveredSubject.error)),
    dialerStopPending: dialerNeedsStop,
    hasDialerSession,
    isCheckingManualDial: manualAudioDial.state.sending || isStartingConference || isStoppingDialer,
    onCheckManualDial: () => {
      if (dialerNeedsStop) void handleConferenceEnd();
      else if (manualAudioDial.state.pending) void manualAudioDial.resource.retry(beginDial);
      else if (awaitingStartReceipt) void begin();
      else void agentAudio.resource.refresh();
    },
    hangUp,
    answer,
    holdAndAnswer,
    incomingCall,
    activeCall,
    callState: displayState,
    callDuration: logicalDuration.callDuration,
    deviceIsBusy: deviceIsBusy || queueFlow.pending,
    isStartingConference,
    startDisabledReason: startDisabledReason ?? audioStartDisabledReason,
    handleDialButton,
    handleDequeueNext: () => { if (!pendingCallRequest && !liveCustomer && !customerRecoveryPending) { retireManualRecovery(); handleDequeueNext(); } },
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
    resetCall: managesCustomerAudio() ? undefined : resetCall,
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
    update: currentUpdate,
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
    onJoin,
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
    audioTest: buildAudioTestGroup(audioDeviceTest, audioControls.output),
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
      selectedDevice,
      phoneConnectionStatus: screenAudio.phoneConnectionStatus,
      audioConnection: screenAudio.controls,
      setSelectedDevice: screenAudio.onSelect,
    },
    featureFlags,
    callSid,
    initialCoaching,
  };
}

export type CallScreenLayoutProps = ReturnType<typeof useCallScreen>;

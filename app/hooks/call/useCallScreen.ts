import { useCallback, useEffect, useRef, useState } from "react";
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
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import { playTone } from "@/lib/utils";
import {
  normalizeProviderStatus,
  getStateMachineAction,
} from "@/lib/call-status";
import { useSupabaseRealtime, useSupabaseRealtimeSubscription } from "@/hooks/realtime/useSupabaseRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useSupabaseRoom from "@/hooks/call/useSupabaseRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
import { logger } from "@/lib/logger.client";
import type {
  ActiveCall,
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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isErrorDialogOpen, setErrorDialog] = useState(!campaignDetails?.script_id);
  const [isDialogOpen, setDialog] = useState(campaign?.dial_type === "predictive" && !isErrorDialogOpen);
  const [isReportDialogOpen, setReportDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<"computer" | string>("computer");
  const [phoneConnectionStatus, setPhoneConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [phoneCallSid, setPhoneCallSid] = useState<string | null>(null);
  const [isAddingNumber, setIsAddingNumber] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const groupByHousehold = campaign?.group_household_queue || false;
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
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
    selectedDevice,
    workspaceId,
    send as unknown as (action: { type: string }) => void,
  );

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

  const callSid =
    (activeCall?.parameters?.CallSid as string | undefined) ??
    recentCall?.sid ??
    null;
  const pollingEnabled =
    !!callSid &&
    !!workspaceId &&
    (state === "dialing" || state === "connected");
  useCallStatusPolling({
    callSid,
    workspaceId,
    enabled: pollingEnabled,
    intervalMs: 5000,
    onStatus: (status) => {
      const normalized = normalizeProviderStatus(status);
      if (normalized) {
        setDisposition(normalized);
        const action = getStateMachineAction(normalized);
        if (action === "CONNECT") send({ type: "CONNECT" });
        else if (action === "HANG_UP") send({ type: "HANG_UP" });
        else if (action === "FAIL") send({ type: "FAIL" });
      }
    },
  });

  const { begin, conference, setConference, creditsError: conferenceCreditsError } = useStartConferenceAndDial(
    {
      userId: user.id,
      campaignId: campaign?.id?.toString() || "",
      workspaceId,
      callerId: campaign?.caller_id || "",
      selectedDevice,
    },
  );

  const fetcher = useFetcher<{ creditsError?: boolean }>();
  const queueFetcher = useFetcher<{ queueError?: boolean }>();
  const submit = fetcher.submit;
  const creditsError = fetcher.data?.creditsError || conferenceCreditsError;
  const verifyFetcher = useFetcher<{ verificationId: string; callSid: string; pin: string; error?: string }>();
  const pin = verifyFetcher.data?.pin;

  const { startCall } = handleCall({ submit });
  const { handleConferenceEnd } = handleConference({
    submit,
    begin,
  });
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
    campaign,
    workspaceId,
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

  const handleDialButton = useCallback(() => {
    if (!campaign) return;

    if (campaign.dial_type === "predictive") {
      if (deviceIsBusy || incomingCall || deviceStatus !== "Registered") {
        logger.debug("Device Busy", { deviceStatus, callCount: device?.calls.length });
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
    device?.calls.length,
    begin,
    startCall,
    nextRecipient,
    user,
    workspaceId,
    recentAttempt,
    selectedDevice,
  ]);

  const handleNextNumber = useCallback(
    (skipHousehold = false) => {
      if (activeCall?.parameters?.CallSid) {
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
      activeCall,
      hangUp,
      nextNumber,
      queue,
      householdMap,
      nextRecipient,
      groupByHousehold,
    ],
  );

  const handleDequeueNext = useCallback(() => {
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
  ]);

  const requestMicrophoneAccess = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableMicrophones(devices.filter((device) => device.kind === "audioinput"));
      setAvailableSpeakers(devices.filter((device) => device.kind === "audiooutput"));
      const audioContext = new window.AudioContext();
      audioContextRef.current = audioContext;
      const gainNode = audioContext.createGain();
      gainNodeRef.current = gainNode;
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      setStream(mediaStream);
      setPermissionError(null);
    } catch (error: unknown) {
      logger.error("Error accessing microphone:", error);
      if (error instanceof Error && error.name === "NotAllowedError") {
        setPermissionError(
          "Microphone access was denied. Please grant permission to use this feature.",
        );
        alert("Microphone access was denied. Please grant permission to use this feature.");
      } else {
        setPermissionError(
          "An error occurred while trying to access the microphone.",
        );
      }
    }
  }, []);

  const handleMicrophoneChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!device) {
      logger.error("No device available");
      return;
    }
    const selectedMicrophone = event.target.value;
    const audio = device.audio;
    audio?.setInputDevice(selectedMicrophone).then(() => {
      setIsMicrophoneMuted(false);
      setMicrophone(selectedMicrophone);
      logger.debug("Microphone set to", selectedMicrophone);

      navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMicrophone } })
        .then((newStream) => {
          if (activeCall) {
            activeCall._setInputTracksFromStream(newStream).then(() => {
              logger.debug("Active call input tracks updated with new microphone");
            }).catch((error: unknown) => {
              logger.error("Error updating active call input tracks:", error);
            });
          }
        })
        .catch((error: unknown) => {
          logger.error("Error getting stream from new microphone:", error);
        });
    }).catch((error: unknown) => {
      logger.error("Error setting microphone:", error);
    });
  }, [device, activeCall]);

  const handleSpeakerChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!device) {
      logger.error("No device available");
      return;
    }
    const selectedSpeaker = event.target.value;
    setOutput(selectedSpeaker);
    device.audio?.speakerDevices.set(selectedSpeaker).then(() => {
      logger.debug("Speaker set to", selectedSpeaker);
    }).catch((error: unknown) => {
      logger.error("Error setting speaker:", error);
    });
  }, [device]);

  const handleMuteMicrophone = useCallback(() => {
    if (!device || !device.audio) return;
    const newMuteState = !isMicrophoneMuted;
    setIsMicrophoneMuted(newMuteState);
    device.audio.incoming(newMuteState);
    if (activeCall) {
      logger.debug("Mute active call", newMuteState);
      activeCall.mute(newMuteState);
    }
  }, [device, activeCall, isMicrophoneMuted]);

  const handleDTMF = useCallback(
    (key: string) => {
      if (audioContextRef.current) playTone(key, audioContextRef.current);
      if (!activeCall) return;
      activeCall?.sendDigits(key);
    },
    [activeCall],
  );

  const handleVoiceDrop = () => {
    if (!activeCall?.parameters?.CallSid) return;
    const formData = new FormData();
    formData.append("callId", activeCall.parameters.CallSid);
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

  const getDisplayState = useCallback((
    callStateValue: string,
    dispositionValue: string | undefined,
    activeCallValue: ActiveCall | null,
  ): string => {
    if (callStateValue === "failed" || dispositionValue === "failed") return "failed";
    if (
      dispositionValue === "ringing" ||
      (activeCallValue && !(dispositionValue === "in-progress"))
    )
      return "dialing";
    if (dispositionValue === "in-progress") return "connected";
    if (dispositionValue === "no-answer") return "no-answer";
    if (dispositionValue === "voicemail") return "voicemail";
    if (callStateValue === "completed" && dispositionValue) return "completed";
    if (!activeCallValue && !dispositionValue) return "idle";
    return "idle";
  }, []);

  const displayState =
    predictiveState.status === "dialing"
      ? "dialing"
      : predictiveState.status === "connected"
        ? "connected"
        : predictiveState.status === "completed"
          ? "completed"
          : predictiveState.status === "idle"
            ? "idle"
            : getDisplayState(
              state,
              recentAttempt?.disposition || undefined,
              activeCall as unknown as ActiveCall,
            );

  const house = householdMap[nextRecipient?.contact?.address || ""];

  const displayColor =
    displayState === "failed"
      ? "hsl(var(--primary))"
      : displayState === "connected" || displayState === "dialing"
        ? "#4CA83D"
        : "#333333";

  useEffect(() => {
    const handleKeypress = (e: KeyboardEvent) => {
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].includes(
        e.key,
      )
        ? handleDTMF(e.key)
        : null;
    };

    window.addEventListener("keypress", handleKeypress);

    return () => window.removeEventListener("keypress", handleKeypress);
  }, [activeCall, handleDTMF]);

  useEffect(() => {
    if (!stream && !permissionError) {
      requestMicrophoneAccess();
    }
  }, [stream, permissionError]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

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

  const handleVerifyNewNumber = async () => {
    verifyFetcher.load(`/api/verify-audio-session?phoneNumber=${newPhoneNumber}&fromNumber=${campaign.caller_id}&workspace_id=${workspaceId}`);
    toast.success("Verification call initiated. Please answer your phone to complete verification.");
    setIsAddingNumber(false);
  };

  const handlePhoneDeviceSelection = async (phoneNumber: string) => {
    if (phoneNumber === "computer") {
      setPhoneConnectionStatus("disconnected");
      setPhoneCallSid(null);
      requestMicrophoneAccess();
      return;
    }

    try {
      setSelectedDevice(phoneNumber);
      setPhoneConnectionStatus("connected");
      toast.success("Connected to your phone. You can now make calls.");
    } catch (error) {
      logger.error("Error connecting phone device:", error);
      toast.error("Failed to connect to your phone. Please try again.");
      setPhoneConnectionStatus("disconnected");
      setSelectedDevice("computer");
      requestMicrophoneAccess();
    }
  };

  useEffect(() => {
    if (selectedDevice !== "computer") {
      handlePhoneDeviceSelection(selectedDevice);
    }
  }, [selectedDevice]);

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
    stream,
    availableMicrophones,
    availableSpeakers,
    handleMicrophoneChange,
    handleSpeakerChange,
    handleMuteMicrophone,
    isMicrophoneMuted,
    availableCredits,
    creditState,
    phoneConnectionStatus,
    selectedDevice,
    setSelectedDevice,
    isAddingNumber,
    setIsAddingNumber,
    newPhoneNumber,
    setNewPhoneNumber,
    handleVerifyNewNumber,
    pin,
    hangUp,
    answer,
    holdAndAnswer,
    incomingCall,
    device,
    requeueContacts,
    navigate,
    isReportDialogOpen,
    setReportDialog,
    handleDTMF,
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
    switchQuestionContact,
    attemptList,
    questionContact,
    handleResponse,
    update,
    saveData,
    householdMap,
    groupByHousehold,
    queue,
    predictiveQueue,
    handleNextNumber,
    fetchMore,
    isDialogOpen,
    setDialog,
    isErrorDialogOpen,
    setErrorDialog,
    currentState,
    creditsError,
  };
}

export type CallScreenLayoutProps = ReturnType<typeof useCallScreen>;

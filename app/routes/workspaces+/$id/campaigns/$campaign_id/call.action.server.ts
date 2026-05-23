import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import type {
  LoaderData,
  QueueItem,
  OutreachAttempt,
  UseSupabaseRealtimeProps,
  AppUser,
  BaseUser,
  ActiveCall,
  CampaignDetails
} from "@/lib/types";
import { useLoaderData, useOutletContext, redirect, useNavigation, useNavigate, useFetcher, useRevalidator } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import { playTone } from "@/lib/utils";
import { generateToken } from "@/routes/api+/token.loader.server";
import {
  normalizeProviderStatus,
  getStateMachineAction,
} from "@/lib/call-status";
import {
  buildQueuedQueueUpdate,
  COMPLETED_QUEUE_COUNT_FILTER,
  isAssignedToUser,
  isQueued,
} from "@/lib/queue-status";
import { Tables } from "@/lib/database.types";
import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { checkSchedule, getUserRole } from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";

const fetcher = useFetcher<{ creditsError?: boolean }>()

const queueFetcher = useFetcher<{ queueError?: boolean }>()

const submit = fetcher.submit;

const creditsError = fetcher.data?.creditsError || conferenceCreditsError;

const verifyFetcher = useFetcher<{ verificationId: string, callSid: string, pin: string, error?: string }>()

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
  toast: toast as unknown as { success: (message: React.ReactNode, data?: unknown) => string | number; error: (message: React.ReactNode, data?: unknown) => string | number; warning: (message: React.ReactNode, data?: unknown) => string | number },
});

// Callback handlers

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
// Audio handlers

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
  if (!device) { logger.error('No device available'); return }
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
  if (!device) { logger.error('No device available'); return }
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
}

const getDisplayState = useCallback((
  state: string,
  disposition: string | undefined,
  activeCall: ActiveCall | null,
): string => {
  if (state === "failed" || disposition === "failed") return "failed";
  if (
    disposition === "ringing" ||
    (activeCall && !(disposition === "in-progress"))
  )
    return "dialing";
  if (disposition === "in-progress") return "connected";
  if (disposition === "no-answer") return "no-answer";
  if (disposition === "voicemail") return "voicemail";
  if (state === "completed" && disposition) return "completed";
  if (!activeCall && !disposition) return "idle";
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

// Effects
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

// Add new function to handle phone number verification

const handleVerifyNewNumber = async () => {
  verifyFetcher.load(`/api/verify-audio-session?phoneNumber=${newPhoneNumber}&fromNumber=${campaign.caller_id}&workspace_id=${workspaceId}`)
  toast.success('Verification call initiated. Please answer your phone to complete verification.');
  setIsAddingNumber(false);
}

// Update the handlePhoneDeviceSelection function

export const action = async ({ request, params }: ActionFunctionArgs) => {


  const { campaign_id } = params;

  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user || !campaign_id) {
    throw redirect("/signin");
  }
  const { data: assignedRows, error: assignedRowsError } = await supabaseClient
    .from("campaign_queue")
    .select("id, status, dequeued_at, assigned_to_user_id")
    .eq("campaign_id", parseInt(campaign_id))
    .is("dequeued_at", null);

  if (assignedRowsError) {
    logger.error("Error fetching assigned campaign queue rows:", assignedRowsError);
    throw assignedRowsError;
  }

  const assignedIds = (assignedRows ?? [])
    .filter((row) => isAssignedToUser(row, user.id))
    .map((row) => row.id);

  if (assignedIds.length === 0) {
    return redirect("/workspaces", { headers });
  }

  const update = await supabaseClient
    .from("campaign_queue")
    .update(buildQueuedQueueUpdate())
    .in("id", assignedIds)
    .select();
  if (update.error) {
    logger.error("Error updating campaign queue:", update.error);
    throw update.error;
  }
  return redirect("/workspaces");
}

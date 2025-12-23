// Core imports
import {
  useLoaderData,
  useOutletContext,
  redirect,
  useNavigation,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import { LoaderFunction, ActionFunction } from "@remix-run/node";
<<<<<<< HEAD
import React, { useEffect, useState, useCallback, useRef } from "react";
=======
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useEffect, useState, useCallback, useRef } from "react";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
import { SupabaseClient } from "@supabase/supabase-js";
import { toast, Toaster } from "sonner";

// Lib imports
import { verifyAuth } from "../lib/supabase.server";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "@/lib/callscreenActions";
import { checkSchedule, getUserRole } from "@/lib/database.server";
import { playTone } from "@/lib/utils";
import { generateToken } from "./api.token";

// Component imports
import { QueueList } from "@/components/call/CallScreen.QueueList";
import { CallArea } from "@/components/call/CallScreen.CallArea";
import { CallQuestionnaire } from "@/components/call/CallScreen.Questionnaire";
import { Household } from "@/components/call/CallScreen.Household";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { CampaignHeader } from "@/components/call/CallScreen.Header";
import { PhoneKeypad } from "@/components/call/CallScreen.DTMFPhone";
import { CampaignDialogs } from "@/components/call/CallScreen.Dialogs";

// Hook imports
<<<<<<< HEAD
import { useSupabaseRealtime } from "@/hooks/realtime/useSupabaseRealtime";
import useDebouncedSave from "@/hooks/utils/useDebouncedSave";
import useSupabaseRoom from "@/hooks/call/useSupabaseRoom";
import { useTwilioDevice } from "@/hooks/call/useTwilioDevice";
import { useStartConferenceAndDial } from "@/hooks/call/useStartConferenceAndDial";
import { useCallState } from "@/hooks/call/useCallState";

=======
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import useDebouncedSave from "../hooks/useDebouncedSave";
import useSupabaseRoom from "../hooks/useSupabaseRoom";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { useStartConferenceAndDial } from "~/hooks/useStartConferenceAndDial";
import { useCallState } from "~/hooks/useCallState";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
// Type imports
import type {
  LoaderData,
  QueueItem,
  OutreachAttempt,
  UseSupabaseRealtimeProps,
  AppUser,
  BaseUser,
  ActiveCall,
<<<<<<< HEAD
  CampaignDetails
} from "@/lib/types";
import { Tables } from "@/lib/database.types";
import { MemberRole } from "@/components/workspace/TeamMember";
=======
  CampaignDetails,
} from "~/lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)

export { ErrorBoundary };

async function getCallScreenData(supabase: SupabaseClient, campaignId: string, workspaceId: string, userId: string) {
  const [
    workspaceData,
    campaign,
    campaignDetails,
    audiences,
    queueCount,
    completedCount,
    attempts,
  ] = await Promise.all([
    supabase.from("workspace").select("*").eq("id", workspaceId).single(),
    supabase.from("campaign").select().eq("id", parseInt(campaignId)).single(),
    supabase
      .from("live_campaign")
      .select(`*, script:script(*)`)
      .eq("campaign_id", parseInt(campaignId))
      .single(),
    supabase.rpc("get_audiences_by_campaign", { selected_campaign_id: parseInt(campaignId) }),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(campaignId)),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(campaignId))
      .eq("status", "dequeued"),
    supabase
      .from("outreach_attempt")
      .select(`*, call:call(*)`)
      .eq("campaign_id", parseInt(campaignId))
      .eq("user_id", userId),
  ]);

  const errors = [
    workspaceData.error,
    campaign.error,
    campaignDetails.error,
    audiences.error,
    queueCount.error,
    completedCount.error,
    attempts.error,
  ].filter(Boolean);

  if (errors.length) {
    console.error(errors);
    throw "Error fetching campaign data";
  }
  return {
    workspaceData: workspaceData.data,
    campaign: campaign.data,
    campaignDetails: campaignDetails.data,
    audiences: audiences.data,
    queueCount: queueCount.count,
    completedCount: completedCount.count,
    attempts: attempts.data,
  }
}
async function getVerifiedNumbers(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('user')
    .select('verified_audio_numbers')
    .eq('id', userId)
    .single();
  if (error) {
    console.error(error);
    throw error;
  }
  return data?.verified_audio_numbers || [];
}
async function getQueueByDialType(supabase: SupabaseClient, campaignId: string, dialType: string, userId: string) {
  let queue = [] as QueueItem[];
  if (dialType === "predictive") {
    const { data, error } = await supabase
      .from('campaign_queue')
      .select('*, contact(*)')
      .eq('campaign_id', parseInt(campaignId))
      .eq('status', 'queued')
      .order('attempts', { ascending: true })
      .order('queue_order', { ascending: true })
      .limit(50);
    if (error) {
      console.error(error);
      throw error;
    }
    queue = data as unknown as QueueItem[];
  } else if (dialType === "call") {
    const { data, error } = await supabase
      .from('campaign_queue')
      .select('*, contact(*)')
      .eq('campaign_id', parseInt(campaignId))
      .eq('status', userId)
      .limit(50);
    if (error) {
      console.error(error);
      throw error;
    }
    queue = data as unknown as QueueItem[];
  }
  else {
    throw "Invalid dial type";
  }
  return queue;
}
function getNextRecipient(queue: QueueItem[], dialType: string, userId: string) {
  if (dialType === "predictive") {
    return null;
  } else if (dialType === "call") {
    queue[0]
  }
}
function getInitialCallsList(attempts: OutreachAttempt[]) {
  return attempts.flatMap((attempt) => attempt.call);
}
function getInitialRecentCall(attempts: OutreachAttempt[]) {
  return attempts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}
function getInitialRecentAttempt(attempts: OutreachAttempt[]) {
  return attempts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

export const loader: LoaderFunction = async ({ request, params }: LoaderFunctionArgs) => {
  const { campaign_id: id, id: workspaceId } = params;
  const {
    supabaseClient: supabase,
    user,
  } = await verifyAuth(request);
  if (!user || !workspaceId || !id) throw redirect("/signin");

  const verifiedNumbers = await getVerifiedNumbers(supabase, user.id);
  const { workspaceData, campaign, campaignDetails, audiences, queueCount, completedCount, attempts } = await getCallScreenData(supabase, id, workspaceId, user.id);
  const twilioData = workspaceData.twilio_data as { sid: string };
  const queue = await getQueueByDialType(supabase, id, campaign.dial_type, user.id);
  const token = generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.key as string,
    twilioApiSecret: workspaceData.token as string,
    identity: user.id,
  });
  const nextRecipient = getNextRecipient(queue, campaign?.dial_type, user.id);
  const initalCallsList = getInitialCallsList(attempts || []);
  const initialRecentCall = getInitialRecentCall(attempts || []);
  const initialRecentAttempt = getInitialRecentAttempt(attempts || []);

  const userRole = await getUserRole({
    supabaseClient: supabase,
    user: user as unknown as BaseUser,
    workspaceId
  });
  const hasAccess = [MemberRole.Owner, MemberRole.Admin].includes(userRole?.role as MemberRole);
  const isActive = campaign ? checkSchedule(campaign) : false;

  return {
    campaign,
    attempts,
    user,
    audiences,
    campaignDetails,
    credits: workspaceData.credits,
    workspaceId,
    queue,
    contacts: queue.map((queueItem) => queueItem.contact),
    nextRecipient,
    initalCallsList,
    initialRecentCall,
    initialRecentAttempt,
    token,
    count: queueCount,
    completed: completedCount,
    isActive,
    hasAccess,
    verifiedNumbers,
  }
};

export const action: ActionFunction = async ({ request, params }: ActionFunctionArgs) => {
  const { campaign_id } = params;

  const { supabaseClient, headers, user } = await verifyAuth(request);
  if (!user || !campaign_id) {
    throw redirect("/signin");
  }
  const update = await supabaseClient
    .from("campaign_queue")
    .update({ status: "queued" })
    .eq("status", user.id)
    .eq("campaign_id", parseInt(campaign_id))
    .select();
  if (update.error) {
    console.error(update.error);
    throw update.error;
  }
  return redirect("/workspaces");
};

const CallScreen: React.FC = () => {
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
  const [selectedDevice, setSelectedDevice] = useState<'computer' | string>('computer');
  const [phoneConnectionStatus, setPhoneConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [phoneCallSid, setPhoneCallSid] = useState<string | null>(null);
  const [isAddingNumber, setIsAddingNumber] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const groupByHousehold = campaign?.group_household_queue || false;
  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  // Hooks
  const { state, context, send } = useCallState();
  const navigate = useNavigate();
  const {
    device,
    status: deviceStatus,
    activeCall,
    incomingCall,
    hangUp,
    callState,
    callDuration,
    setCallDuration,
    deviceIsBusy,
  } = useTwilioDevice({ token, selectedDevice, workspaceId, send });

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

  const { begin, conference, setConference, creditsError: conferenceCreditsError } = useStartConferenceAndDial(
    {
      userId: user.id,
      campaignId: campaign?.id?.toString() || "",
      workspaceId,
      callerId: campaign?.caller_id || "",
      selectedDevice,
    }
  );

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
    if (deviceIsBusy || incomingCall || deviceStatus !== "registered") {
      console.log("Device Busy", deviceStatus, device?.calls.length);
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
    console.error("Error accessing microphone:", error);
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
  if (!device) { console.error('No device'); return };
  const selectedMicrophone = event.target.value;
  let audio = device.audio;
  audio?.setInputDevice(selectedMicrophone).then(() => {
    setIsMicrophoneMuted(false);
    setMicrophone(selectedMicrophone);
    console.log("Microphone set to", selectedMicrophone);

    navigator.mediaDevices.getUserMedia({ audio: { deviceId: selectedMicrophone } })
      .then((newStream) => {
        if (activeCall) {
          activeCall._setInputTracksFromStream(newStream).then(() => {
            console.log("Active call input tracks updated with new microphone");
          }).catch((error: unknown) => {
            console.error("Error updating active call input tracks:", error);
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Error getting stream from new microphone:", error);
      });
  }).catch((error: unknown) => {
    console.error("Error setting microphone:", error);
  });
}, [device, activeCall]);

const handleSpeakerChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
  if (!device) { console.error('No device'); return };
  const selectedSpeaker = event.target.value;
  setOutput(selectedSpeaker);
  device.audio?.speakerDevices.set(selectedSpeaker).then(() => {
    console.log("Speaker set to", selectedSpeaker);
  }).catch((error: unknown) => {
    console.error("Error setting speaker:", error);
  });
}, [device]);

const handleMuteMicrophone = useCallback(() => {
  if (!device || !device.audio) return;
  const newMuteState = !isMicrophoneMuted;
  setIsMicrophoneMuted(newMuteState);
  device.audio.incoming(newMuteState);
  if (activeCall) {
    console.log("Mute active call", newMuteState);
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
        send({ type: "CONNECT" });
        break;
      case "completed":
      case "failed":
      case "no-answer":
        send({ type: "HANG_UP" });
        break;
      default:
        send({ type: "NEXT" });
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
const handlePhoneDeviceSelection = async (phoneNumber: string) => {
  if (phoneNumber === 'computer') {
    setPhoneConnectionStatus('disconnected');
    setPhoneCallSid(null);
    requestMicrophoneAccess();
    return;
  }

  try {
    setSelectedDevice(phoneNumber);
    setPhoneConnectionStatus('connected');
    toast.success('Connected to your phone. You can now make calls.');

  } catch (error) {
    console.error('Error connecting phone device:', error);
    toast.error('Failed to connect to your phone. Please try again.');
    setPhoneConnectionStatus('disconnected');
    setSelectedDevice('computer');
    requestMicrophoneAccess();
  }
};

// Effect to handle device changes
useEffect(() => {
  if (selectedDevice !== 'computer') {
    handlePhoneDeviceSelection(selectedDevice);
  }
}, [selectedDevice]);

return (
  <main className="container mx-auto p-6">
    <div
      style={{
        border: "3px solid #BCEBFF",
        alignItems: "stretch",
        display: "flex",
        borderRadius: "20px",
        justifyContent: "space-between",
      }}
      className="mb-6"
    >
      <CampaignHeader
        campaign={campaign}
        count={count}
        completed={completed}
        onLeaveCampaign={() => {
          hangUp();
          device?.destroy();
          requeueContacts();
          navigate(-1);
        }}
        onReportError={() => setReportDialog(!isReportDialogOpen)}
        mediaStream={stream}
        availableMicrophones={availableMicrophones}
        availableSpeakers={availableSpeakers}
        handleMicrophoneChange={handleMicrophoneChange}
        handleSpeakerChange={handleSpeakerChange}
        handleMuteMicrophone={handleMuteMicrophone}
        isMicrophoneMuted={isMicrophoneMuted}
        availableCredits={availableCredits}
        creditState={creditState}
        hasAccess={hasAccess}
        phoneStatus={phoneConnectionStatus}
        selectedDevice={selectedDevice}
        onDeviceSelect={setSelectedDevice}
        verifiedNumbers={verifiedNumbers}
        isAddingNumber={isAddingNumber}
        onAddNumberClick={() => setIsAddingNumber(true)}
        onAddNumberCancel={() => setIsAddingNumber(false)}
        newPhoneNumber={newPhoneNumber}
        onNewPhoneNumberChange={setNewPhoneNumber}
        onVerifyNewNumber={handleVerifyNewNumber}
        pin={pin || ""}
      />
      <div className="m-4">
        <PhoneKeypad
          onKeyPress={handleDTMF}
          displayState={displayState}
          displayColor={displayColor}
          callDuration={callDuration}
        />
      </div>
    </div>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-6">
<<<<<<< HEAD
        <CallArea
          conference={conference ? { parameters: { Sid: conference } } : null}
=======
          <CallArea
            conference={conference}
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
          isBusy={isBusy || deviceIsBusy}
          predictive={campaign.dial_type === "predictive"}
          nextRecipient={nextRecipient}
            activeCall={activeCall as unknown as ActiveCall}
          recentCall={recentCall}
          handleVoiceDrop={handleVoiceDrop}
          hangUp={
            campaign.dial_type === "predictive"
              ? () => handleConferenceEnd({
                activeCall: activeCall as unknown as ActiveCall,
<<<<<<< HEAD
                setConference: () => setConference(null),
=======
                setConference,
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
                workspaceId,
              })
              : () => {
                if (hangUp) hangUp();
              }
          }
          displayState={displayState}
<<<<<<< HEAD
          dispositionOptions={(campaignDetails.disposition_options as unknown) as string[]}
=======
            dispositionOptions={(campaignDetails as { disposition_options?: Array<{ value: string; label: string }> }).disposition_options || []}
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
          handleDialNext={handleDialButton}
          handleDequeueNext={handleDequeueNext}
          disposition={disposition}
          setDisposition={setDisposition}
          recentAttempt={recentAttempt}
          callState={callState}
          callDuration={callDuration}
          voiceDrop={Boolean(campaignDetails.voicedrop_audio)}
        />
        <Household
          isBusy={isBusy}
          house={house}
          switchQuestionContact={(args: { contact: QueueItem }) => switchQuestionContact({ contact: args.contact.contact })}
          attemptList={attemptList as unknown as (Tables<"outreach_attempt"> & { result?: { status?: string } })[]}
          questionContact={questionContact}
        />
      </div>
      <CallQuestionnaire
        isBusy={isBusy}
<<<<<<< HEAD
        handleResponse={(response: { pageId: string; blockId: string; value: string | number | boolean | string[] | null | undefined }) => {
          const value = response.value;
          if (value !== undefined && value !== null) {
            handleResponse({ blockId: response.blockId, value: typeof value === 'string' || Array.isArray(value) ? value : String(value) });
          }
        }}
        campaignDetails={campaignDetails as unknown as CampaignDetails & { script: { steps: { pages?: Record<string, { id: string; title: string; blocks: string[] }>; blocks?: Record<string, { id: string; type: string; title: string; content: string; options?: Array<{ value: string; label: string; next: string }>; audioFile: string }> } } }}
        update={(update || {}) as Record<string, Record<string, string | number | boolean | string[] | null | undefined>>}
=======
        handleResponse={handleResponse}
        campaignDetails={campaignDetails}
        update={update || {}}
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
        nextRecipient={questionContact}
        handleQuickSave={saveData}
        disabled={!questionContact}
      />
      <QueueList
        isBusy={isBusy}
        householdMap={householdMap}
        groupByHousehold={groupByHousehold}
        queue={campaign.dial_type === "call" ? queue : predictiveQueue}
        handleNextNumber={handleNextNumber}
        nextRecipient={nextRecipient}
        handleQueueButton={() => fetchMore({ householdMap })}
        predictive={campaign.dial_type === "predictive"}
        count={count}
        completed={completed}
      />
    </div>
    <Toaster richColors />
    <CampaignDialogs
      isDialogOpen={isDialogOpen}
      setDialog={setDialog}
      isErrorDialogOpen={isErrorDialogOpen}
      setErrorDialog={setErrorDialog}
      isReportDialogOpen={isReportDialogOpen}
      setReportDialog={setReportDialog}
      campaign={{
        title: campaign.title,
        dial_type: campaign.dial_type || "call",
        voicemail_file: Boolean(campaign.voicemail_file),
      }}
      fetchMore={fetchMore}
      householdMap={householdMap}
      currentState={currentState}
      isActive={isActive}
      creditsError={credits === 0 || creditsError}
      hasAccess={hasAccess}
    />
  </main>
);
};

export default CallScreen;

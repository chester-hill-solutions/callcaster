// Core imports
import {
  json,
  useLoaderData,
  useOutletContext,
  redirect,
  useNavigation,
  useNavigate,
  useFetcher,
} from "@remix-run/react";
import { LoaderFunction, ActionFunction } from "@remix-run/node";
import { useEffect, useState, useCallback, useRef } from "react";
import { SupabaseClient, User, createClient } from "@supabase/supabase-js";
import { toast, Toaster } from "sonner";

// Lib imports
import { verifyAuth } from "../lib/supabase.server";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "~/lib/callscreenActions";
import { getUserRole } from "~/lib/database.server";
import { playTone } from "~/lib/utils";
import { generateToken } from "./api.token";
import { Json } from "~/lib/database.types";

// Component imports
import { QueueList } from "../components/CallScreen.QueueList";
import { CallArea } from "../components/CallScreen.CallArea";
import CallQuestionnaire from "../components/CallScreen.Questionnaire";
import { Household } from "~/components/CallScreen.Household";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { CampaignHeader } from "~/components/CallScreen.Header";
import { PhoneKeypad } from "~/components/CallScreen.DTMFPhone";
import { CampaignDialogs } from "~/components/CallScreen.Dialogs";

// Hook imports
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import useDebouncedSave from "../hooks/useDebouncedSave";
import useSupabaseRoom from "../hooks/useSupabaseRoom";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { useStartConferenceAndDial } from "~/hooks/useStartConferenceAndDial";
import { useCallState } from "~/hooks/useCallState";
import { useQueueManagement } from "~/hooks/useQueueManagement";

// Type imports
import {
  Audience,
  Call,
  Campaign as CampaignType,
  Contact,
  LiveCampaign,
  OutreachAttempt,
  QueueItem,
  Workspace,
  WorkspaceNumbers,
} from "~/lib/types";
import { MemberRole } from "~/components/Workspace/TeamMember";

interface ExtendedUser extends User {
  access_level: string | null;
  activity: Json;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  organization: number | null;
  username: string;
}

interface LoaderData {
  campaign: CampaignType;
  attempts: OutreachAttempt[];
  user: ExtendedUser;
  audiences: Audience[];
  workspaceId: string;
  workspace: Workspace;
  campaignDetails: {
    campaign_id: number | null;
    created_at: string;
    disposition_options: Json | any[];
    id: number;
    questions: Json | any[];
    script_id: number | null;
    voicedrop_audio: string | null;
    workspace: string;
    script?: {
      steps?: {
        pages?: Record<string, any>;
        blocks?: Record<string, any>;
      };
    };
  };
  credits: number;
  contacts: Contact[];
  queue: QueueItem[];
  nextRecipient: QueueItem | null;
  initalCallsList: Call[];
  initialRecentCall: Call | null;
  initialRecentAttempt: OutreachAttempt | null;
  token: string;
  count: number;
  completed: number;
  isActive: boolean;
  hasAccess: boolean;
  phoneNumbers: WorkspaceNumbers[];
}

export { ErrorBoundary };

export const loader: LoaderFunction = async ({ request, params }) => {
  const { selected_id: id, id: workspaceId } = params;
  const { supabaseClient: supabase, headers, user } = await verifyAuth(request);

  if (!user || !workspaceId || !id) {
    throw redirect("/signin");
  }

  // Fetch essential campaign and workspace data in parallel
  const [campaignResponse, workspaceResponse] = await Promise.all([
    supabase
      .from("campaign")
      .select('*, details:live_campaign(*)')
      .eq("id", parseInt(id))
      .single(),
    supabase
      .from("workspace")
      .select("*, twilio_data, workspace_number(*)")
      .eq("id", workspaceId)
      .single()
  ]);

  if (campaignResponse.error || !campaignResponse.data) {
    console.error("Campaign not found", campaignResponse.error);
    throw new Error("Campaign not found");
  }

  if (workspaceResponse.error || !workspaceResponse.data) {
    console.error("Workspace not found", workspaceResponse.error);
    throw new Error("Workspace not found");
  }

  const campaign = campaignResponse.data;
  const workspace = workspaceResponse.data;

  // Early validation of campaign type
  if (!campaign.dial_type) {
    return redirect(`./../settings`);
  }

  if (!workspace.twilio_data) {
    throw new Error("Workspace configuration error");
  }

  // Fetch campaign details and audiences in parallel
  const [campaignDetails, audiencesResponse] = await Promise.all([
    supabase
      .from(campaign.type === "live_call" ? "live_campaign" : "ivr_campaign")
      .select("*, script(*)")
      .eq("campaign_id", parseInt(id))
      .single(),
    supabase
      .from("audience")
      .select("*")
      .eq("workspace", workspaceId)
  ]);

  if (campaignDetails.error) {
    throw new Error("Campaign details not found");
  }

  const twilioData = workspace.twilio_data as { sid: string };
  
  // Generate Twilio token
  const token = generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspace.key as string,
    twilioApiSecret: workspace.token as string,
    identity: user.id,
  });

  // Fetch queue data based on campaign type
  const queueQuery = supabase
    .from("campaign_queue")
    .select(`*, contact:contact(*)`)
    .eq("campaign_id", parseInt(id));

  if (campaign.dial_type === "predictive") {
    queueQuery.in("status", ["queued", user.id]);
  } else {
    queueQuery.eq("status", user.id);
  }

  queueQuery
    .order("attempts", { ascending: true })
    .order("queue_order", { ascending: true })
    .limit(50);

  const { data: queueData, error: queueError } = await queueQuery;
  const queue = queueData || [];

  if (queueError) {
    console.error("Queue fetch error:", queueError);
    throw queueError;
  }

  // Get queue counts
  const [queueCount, completedCount] = await Promise.all([
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(id))
      .limit(1),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", parseInt(id))
      .eq("status", "dequeued")
      .limit(1)
  ]);

  // Fetch user attempts and calls
  const { data: attempts = [], error: attemptsError } = await supabase
    .from("outreach_attempt")
    .select(`*, call:call(*)`)
    .eq("campaign_id", parseInt(id))
    .eq("user_id", user.id);

  if (attemptsError) {
    console.error("Attempts fetch error:", attemptsError);
    throw attemptsError;
  }

  // Get user role
  const userRole = await getUserRole({ 
    supabaseClient: supabase, 
    user: user as unknown as ExtendedUser, 
    workspaceId 
  });

  // Prepare initial state
  const nextRecipient = campaign.dial_type === "call" ? queue[0] : null;
  const callsList = attempts?.flatMap((attempt) => attempt.call) || [];
  const recentCall = nextRecipient?.contact && 
    callsList.find((call) => call.contact_id === nextRecipient?.contact?.id);
  const recentAttempt = attempts
    ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .find((call) => call.contact_id === nextRecipient?.contact?.id);

  return json(
    {
      attempts,
      user,
      credits: workspace.credits,
      workspaceId,
      workspace,
      campaign,
      campaignDetails: campaignDetails.data,
      audiences: audiencesResponse.data || [],
      phoneNumbers: workspace.workspace_number,
      queue,
      contacts: queue.map((queueItem) => queueItem.contact),
      nextRecipient,
      initalCallsList: callsList,
      initialRecentCall: recentCall,
      initialRecentAttempt: recentAttempt,
      token,
      count: queueCount.count || 0,
      completed: completedCount.count || 0,
      hasAccess: [MemberRole.Owner, MemberRole.Admin].includes(userRole as MemberRole),
      isActive: true
    },
    { headers }
  );
};

export const action: ActionFunction = async ({ request, params }) => {
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

// Add type for householdMap
type HouseholdMap = Record<string, QueueItem[]>;

const Campaign: React.FC = () => {
  const {
    attempts: initialAttempts,
    user,
    workspaceId,
    campaign,
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
    isActive = true,
    hasAccess
  } = useLoaderData<LoaderData>();

  const { state: navState } = useNavigation();
  const isBusy = navState !== "idle";

  // Get supabase instance
  const {supabase} = useOutletContext<{supabase: SupabaseClient}>();

  // Calculate disabled states
  const joinDisabled = (!campaignDetails?.script_id)
    ? "No script selected"
    : !campaign?.caller_id
      ? "No outbound phone number selected"
      : campaign?.status === "scheduled"
        ? `Campaign scheduled.`
        : !campaign?.is_active
          ? "It is currently outside of the Campaign's calling hours"
          : null;

  const scheduleDisabled = (!campaignDetails?.script_id)
    ? "No script selected"
    : !campaign?.caller_id
      ? "No outbound phone number selected"
      : null;

  if (!campaign) {
    throw new Error("Campaign data is required");
  }

  // State management
  const [questionContact, setQuestionContact] = useState<QueueItem | null>(initialNextRecipient);
  const [groupByHousehold] = useState<boolean>(Boolean(campaign.group_household_queue));
  const [update, setUpdate] = useState<Record<string, unknown> | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState<boolean>(false);
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isErrorDialogOpen, setErrorDialog] = useState(!campaignDetails?.script_id);
  const [isDialogOpen, setDialog] = useState(campaignDetails?.campaign_id && !isErrorDialogOpen);
  const [isReportDialogOpen, setReportDialog] = useState(false);
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
  } = useTwilioDevice(token, workspaceId, send as (action: { type: string }) => void);

  const {
    status: liveStatus,
    users: onlineUsers,
    predictiveState,
  } = useSupabaseRoom({
    supabase,
    workspace: workspaceId,
    campaign: campaign.id,
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
    user: user as ExtendedUser,
    supabase,
    init: {
      predictiveQueue: campaign.dial_type === "predictive" ? initialQueue : [],
      queue: campaign.dial_type === "call" ? initialQueue : [],
      callsList: initalCallsList,
      attempts: initialAttempts,
      recentCall: initialRecentCall || null,
      recentAttempt: initialRecentAttempt || null,
      nextRecipient: initialNextRecipient || null,
      credits: credits || 0
    },
    campaign_id: campaign.id! as unknown as string,
    setQuestionContact,
    predictive: campaign.dial_type === "predictive",
    setCallDuration,
    setUpdate,
  });

  const { begin, conference, setConference, creditsError: conferenceCreditsError } = useStartConferenceAndDial(
    user.id,
    campaign.id! as unknown as string,
    workspaceId,
    campaign.caller_id,
  );

  const fetcher = useFetcher<{creditsError?: boolean}>()
  const queueFetcher = useFetcher<{queueError?: boolean}>()
  const submit = fetcher.submit;
  const creditsError = fetcher.data?.creditsError || conferenceCreditsError;
  // Action handlers
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
    campaign: campaign,
    workspaceId,
    setQueue,
  });
  const { saveData, isSaving } = useDebouncedSave({
    update,
    recentAttempt,
    nextRecipient,
    campaign: campaign,
    workspaceId,
    disposition,
    toast,
  });

  // Callback handlers
  const handleResponse = useCallback(
    ({ blockId, value }: { blockId: string; value: string | string[] }) => {
      setUpdate((curr) => ({ ...curr, [blockId]: value }));
    },
    [],
  );

  const handleDialButton = useCallback(() => {
    if (campaign.dial_type === "predictive") {
      if (deviceIsBusy || incomingCall || deviceStatus !== "Registered") {
        console.log("Device Busy", deviceStatus, device?.calls.length);
        return;
      }
      begin();
    } else if (campaign.dial_type === "call") {
      startCall({
        contact: nextRecipient?.contact,
        campaign: campaign,
        user,
        workspaceId,
        nextRecipient,
        recentAttempt,
      });
    }
  }, [
    campaign.dial_type,
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
  ]);

  const handleNextNumber = useCallback(
    (skipHousehold = false) => {
      activeCall?.parameters?.CallSid && hangUp();
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
    if (campaign.dial_type === "predictive") {
      send({ type: "HANG_UP" });
      setCallDuration(0);
      handleDialButton();
      saveData();
    } else if (campaign.dial_type === "call" && nextRecipient) {
      saveData();
      dequeue({ contact: nextRecipient });
      const householdMapObject: Record<string, QueueItem[]> = householdMap as Record<string, QueueItem[]>;
      fetchMore({ householdMap: householdMapObject });
      handleNextNumber(campaign.group_household_queue || false);
      send({ type: "HANG_UP" });
      setRecentAttempt(null);
      setUpdate({});
      setCallDuration(0);
    }
  }, [
    campaign.dial_type,
    campaign.group_household_queue,
    send,
    setCallDuration,
    handleDialButton,
    saveData,
    dequeue,
    nextRecipient,
    fetchMore,
    householdMap,
    handleNextNumber,
    setRecentAttempt,
  ]);

  const handleQueueButtonClick = useCallback(() => {
    fetchMore({ householdMap });
  }, [fetchMore, householdMap]);

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
    } catch (error: any) {
      console.error("Error accessing microphone:", error);
      if (error.name === "NotAllowedError") {
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
            }).catch((error) => {
              console.error("Error updating active call input tracks:", error);
            });
          }
        })
        .catch((error) => {
          console.error("Error getting stream from new microphone:", error);
        });
    }).catch((error) => {
      console.error("Error setting microphone:", error);
    });
  }, [device, activeCall]);

  const handleSpeakerChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!device) { console.error('No device'); return };
    const selectedSpeaker = event.target.value;
    setOutput(selectedSpeaker);
    device.audio?.speakerDevices.set(selectedSpeaker).then(() => {
      console.log("Speaker set to", selectedSpeaker);
    }).catch((error) => {
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
      if (audioContextRef.current) playTone(key, audioContextRef?.current);
      if (!activeCall) return;
      else {
        activeCall?.sendDigits(key);
      }
    },
    [activeCall],
  );

  const handleVoiceDrop = () => {
    if (!activeCall) return;
    const formData = new FormData();
    formData.append("callId", activeCall?.parameters?.CallSid);
    formData.append("workspaceId", workspaceId);
    formData.append("campaignId", campaign.id?.toString() || "");

    submit(formData, {
      method: "POST",
      action: "/api/audiodrop"
    });
  };

  const requeueContacts = () => {
    const userId = user.id;
    const campaignId = campaign.id?.toString() || "";
    submit({ userId, campaignId }, {
      method: "DELETE",
      action: "/api/queues",
      encType: "application/json"
    });
  }

  // Helper functions
  const getDisplayState = useCallback((
    state: string,
    disposition: string | undefined,
    activeCall: object | null,
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
  }, [state, disposition, activeCall]);

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
              activeCall,
            );

  // Update householdMap type
  const house = householdMap[
    Object.keys(householdMap).find(
      (house) => house === nextRecipient?.contact?.address,
    ) || ""
  ] as QueueItem[];

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
  }, [stream, permissionError, requestMicrophoneAccess]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
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
  const creditState: "GOOD" |"WARNING" |"BAD" = availableCredits > queue.length ? "GOOD" : availableCredits  > 0 && availableCredits < queue.length ? "WARNING" : "BAD";

  return (
    <main className="container mx-auto p-6 min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
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
        />
        <div className="border-t border-gray-200 p-4">
          <PhoneKeypad
            onKeyPress={handleDTMF}
            displayState={displayState}
            displayColor={displayColor}
            callDuration={callDuration}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 max-h-[calc(100vh-20rem)]">
        {/* Left Column - Call Controls */}
        <div className="flex flex-col gap-6 max-h-full overflow-y-auto">
          <CallArea
            conference={conference}
            isBusy={isBusy || deviceIsBusy}
            predictive={campaign.dial_type === "predictive"}
            nextRecipient={nextRecipient}
            activeCall={activeCall as any}
            recentCall={recentCall}
            handleVoiceDrop={handleVoiceDrop}
            hangUp={() =>
              campaign.dial_type === "predictive"
                ? handleConferenceEnd({
                  activeCall,
                  setConference,
                  workspaceId,
                })
                : hangUp()
            }
            displayState={displayState}
            dispositionOptions={campaignDetails?.disposition_options as any[] ?? []}
            handleDialNext={handleDialButton}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
            callState={callState}
            callDuration={callDuration}
            voiceDrop={Boolean(campaignDetails?.voicedrop_audio)}
          />
          
          <Household
            isBusy={isBusy}
            house={house}
            switchQuestionContact={switchQuestionContact}
            attemptList={attemptList}
            questionContact={questionContact}
          />
        </div>

        {/* Middle Column - Questionnaire */}
        <div className="max-h-full overflow-y-auto">
          {questionContact && campaignDetails && (
            <CallQuestionnaire
              isBusy={isBusy}
              handleResponse={handleResponse}
              campaignDetails={{
                campaign_id: campaignDetails?.campaign_id ?? null,
                created_at: campaignDetails?.created_at ?? '',
                disposition_options: (campaignDetails?.disposition_options as any[] | null) ?? [],
                id: campaignDetails?.id ?? 0,
                questions: (campaignDetails?.questions as any[] | null) ?? [],
                script_id: campaignDetails?.script_id ?? null,
                voicedrop_audio: campaignDetails?.voicedrop_audio ?? null,
                workspace: campaignDetails?.workspace ?? workspaceId,
                script: campaignDetails?.script || {
                  steps: {
                    pages: {},
                    blocks: {}
                  }
                }
              }}
              update={update || {}}
              nextRecipient={questionContact}
              handleQuickSave={saveData}
              disabled={!questionContact}
            />
          )}
        </div>

        {/* Right Column - Queue */}
        <div className="max-h-full overflow-y-auto">
          <QueueList
            isBusy={isBusy}
            householdMap={householdMap as HouseholdMap}
            groupByHousehold={groupByHousehold}
            queue={campaign.dial_type === "call" ? queue : predictiveQueue}
            handleNextNumber={handleNextNumber}
            nextRecipient={nextRecipient}
            handleQueueButton={handleQueueButtonClick}
            predictive={campaign.dial_type === "predictive"}
            count={count}
            completed={completed}
          />
        </div>
      </div>

      <Toaster richColors />
      <CampaignDialogs
        isDialogOpen={Boolean(isDialogOpen)}
        setDialog={setDialog}
        isErrorDialogOpen={isErrorDialogOpen}
        setErrorDialog={setErrorDialog}
        isReportDialogOpen={isReportDialogOpen}
        setReportDialog={setReportDialog}
        campaign={{
          title: campaign.title || '',
          dial_type: campaign.dial_type || '',
          voicemail_file: Boolean(campaign.voicemail_file)
        }}
        fetchMore={fetchMore}
        householdMap={householdMap as HouseholdMap}
        currentState={currentState}
        isActive={isActive}
        creditsError={credits === 0 || creditsError}
        hasAccess={hasAccess}
      />
    </main>
  );
};

export default Campaign;

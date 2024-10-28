// Core imports
import {
  json,
  useLoaderData,
  useOutletContext,
  redirect,
  useSubmit,
  useNavigation,
  useNavigate,
} from "@remix-run/react";
import { LoaderFunction, ActionFunction } from "@remix-run/node";
import { useEffect, useState, useCallback, useRef } from "react";
import { SupabaseClient, User } from "@supabase/supabase-js";
import { toast, Toaster } from "sonner";

// Lib imports
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "~/lib/callscreenActions";
import { checkSchedule } from "~/lib/database.server";
import { playTone } from "~/lib/utils";
import { generateToken } from "./api.token";

// Component imports
import { QueueList } from "../components/CallScreen.QueueList";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
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

// Type imports
import {
  Audience,
  Call,
  Campaign as CampaignType,
  Contact,
  IVRCampaign,
  LiveCampaign,
  OutreachAttempt,
  QueueItem,
} from "~/lib/types";

interface LoaderData {
  campaign: CampaignType;
  attempts: OutreachAttempt[];
  user: User;
  audiences: Audience[];
  workspaceId: string;
  campaignDetails: LiveCampaign;
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
}

export { ErrorBoundary };

export const loader: LoaderFunction = async ({ request, params }) => {
  const { campaign_id: id, id: workspaceId } = params;
  const {
    supabaseClient: supabase,
    headers,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);

  if (!serverSession || !workspaceId || !id) throw redirect("/signin");

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
    supabase.from("campaign").select().eq("id", id).single(),
    supabase
      .from("live_campaign")
      .select(`*, script:script(*)`)
      .eq("campaign_id", id)
      .single(),
    supabase.rpc("get_audiences_by_campaign", { selected_campaign_id: parseInt(id) }),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id),
    supabase
      .from("campaign_queue")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "dequeued"),
    supabase
      .from("outreach_attempt")
      .select(`*, call:call(*)`)
      .eq("campaign_id", id)
      .eq("user_id", serverSession.user.id),
  ]);

  const isActive = checkSchedule(campaign.data);
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
    throw "Error fetching campaign data";
  }
  if (!workspaceData.data || !workspaceData.data.twilio_data) {
    throw "Error fetching workspace data";
  }
  const twilioData = workspaceData.data.twilio_data as { sid: string };
  const token = generateToken({
    twilioAccountSid: twilioData.sid,
    twilioApiKey: workspaceData.data.key as string,
    twilioApiSecret: workspaceData.data.token as string,
    identity: serverSession.user.id,
  });

  let queue = [] as QueueItem[];

  if (campaign.data?.dial_type === "predictive") {
    const { data, error } = await supabase
      .from("campaign_queue")
      .select(`*, contact:contact(*)`)
      .in("status", ["queued", serverSession.user.id])
      .eq("campaign_id", id)
      .order("attempts", { ascending: true })
      .order("queue_order", { ascending: true });

    if (error) {
      console.error(error);
      throw error.message || "Error fetching queue data";
    }
    queue = data as unknown as QueueItem[];
  } else if (campaign.data?.dial_type === "call") {
    const { data, error } = await supabase
      .from("campaign_queue")
      .select(`id, status, contact:contact(*)`)
      .eq("status", serverSession.user.id)
      .eq("campaign_id", id);

    if (error) {
      console.error(error);
      throw error.message || "Error fetching queue data";
    }
    queue = data as unknown as QueueItem[];
  } else if (!campaign.data?.dial_type) {
    return redirect("./../settings");
  }
  const nextRecipient =
    queue && campaign.data.dial_type === "call" ? queue[0] : null;
  const initalCallsList = attempts.data?.flatMap((attempt) => attempt.call) || [];
  const initialRecentCall =
    nextRecipient?.contact &&
    initalCallsList.find(
      (call) => call.contact_id === nextRecipient?.contact?.id,
    );
  const initialRecentAttempt = attempts.data
    ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .find((call) => call.contact_id === nextRecipient?.contact?.id);

  return json(
    {
      campaign: campaign.data,
      attempts: attempts.data,
      user: serverSession.user,
      audiences: audiences.data,
      campaignDetails: campaignDetails.data,
      workspaceId,
      queue,
      contacts: queue.map((queueItem) => queueItem.contact),
      nextRecipient,
      initalCallsList,
      initialRecentCall,
      initialRecentAttempt,
      token,
      count: queueCount.count,
      completed: completedCount.count,
      isActive,
    },
    { headers },
  );
};

export const action: ActionFunction = async ({ request, params }) => {
  const { campaign_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user || !campaign_id) {
    throw redirect("/signin");
  }
  const update = await supabaseClient
    .from("campaign_queue")
    .update({ status: "queued" })
    .eq("status", serverSession.user.id)
    .eq("campaign_id", campaign_id)
    .select();
  if (update.error) {
    console.error(update.error);
    throw update.error;
  }
  return redirect("/workspaces");
};

const Campaign: React.FC = () => {
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
  const { state: navState } = useNavigation();
  const isBusy = navState !== "idle";
  const {
    campaign,
    attempts: initialAttempts,
    user,
    workspaceId,
    campaignDetails,
    contacts,
    queue: initialQueue,
    nextRecipient: initialNextRecipient,
    initalCallsList,
    initialRecentCall,
    initialRecentAttempt,
    token,
    count,
    completed,
    isActive
  } = useLoaderData<LoaderData>();

  // State management
  const [questionContact, setQuestionContact] = useState<QueueItem | null>(initialNextRecipient);
  const [groupByHousehold] = useState<boolean>(true);
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
    setRecentAttempt,
    disposition,
    setDisposition,
    householdMap,
    nextRecipient,
    setNextRecipient,
  } = useSupabaseRealtime({
    user,
    supabase,
    init: {
      predictiveQueue: campaign?.dial_type === "predictive" ? initialQueue : [],
      queue: campaign?.dial_type === "call" ? initialQueue : [],
      callsList: initalCallsList,
      attempts: initialAttempts,
      recentCall: initialRecentCall || null,
      recentAttempt: initialRecentAttempt || null,
      nextRecipient: initialNextRecipient || null,
    },
    contacts,
    campaign_id: campaign?.id! as unknown as string,
    activeCall,
    setQuestionContact,
    predictive: campaign?.dial_type === "predictive",
    setCallDuration,
    setUpdate,
  });

  const { begin, conference, setConference } = useStartConferenceAndDial(
    user.id,
    campaign?.id! as unknown as string,
    workspaceId,
    campaign?.caller_id,
  );

  const submit = useSubmit();

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
    submit,
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
    if (campaign?.dial_type === "predictive") {
      if (deviceIsBusy || incomingCall || deviceStatus !== "Registered") {
        console.log("Device Busy", deviceStatus, device?.calls.length);
        return;
      }
      begin();
    } else if (campaign?.dial_type === "call") {
      startCall({
        contact: nextRecipient?.contact,
        campaign,
        user,
        workspaceId,
        nextRecipient,
        recentAttempt,
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
    if (campaign?.dial_type === "predictive") {
      send({ type: "HANG_UP" });
      setCallDuration(0);
      handleDialButton();
      saveData();
    } else if (campaign?.dial_type === "call") {
      saveData();
      dequeue({ contact: nextRecipient });
      fetchMore({ householdMap });
      handleNextNumber({ skipHousehold: true });
      send({ type: "HANG_UP" });
      setRecentAttempt(null);
      setUpdate({});
      setCallDuration(0);
    }
  }, [
    campaign?.dial_type,
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
    formData.append("campaignId", campaign?.id?.toString() || "");

    submit(formData, {
      method: "POST",
      action: "/api/audiodrop",
      navigate: false,
    });
  };

  const requeueContacts = () => {
    const userId = user.id;
    const campaignId = campaign?.id?.toString() || "";
    submit({ userId, campaignId }, {
      method: "DELETE",
      action: "/api/queues",
      encType: "application/json",
      navigate: false,
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

  const house =
    householdMap[
    Object.keys(householdMap).find(
      (house) => house === nextRecipient?.contact?.address,
    ) || ""
    ];

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
          campaign={campaign!}
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
          <CallArea
            conference={conference}
            isBusy={isBusy || deviceIsBusy}
            predictive={campaign?.dial_type === "predictive"}
            nextRecipient={nextRecipient}
            activeCall={activeCall}
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
            dispositionOptions={campaignDetails?.disposition_options}
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
        <CallQuestionnaire
          isBusy={isBusy}
          handleResponse={handleResponse}
          campaignDetails={campaignDetails}
          update={update}
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
          handleQueueButton={fetchMore}
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
        campaign={campaign}
        fetchMore={fetchMore}
        householdMap={householdMap}
        currentState={currentState}
        isActive={isActive}
      />
    </main>
  );
};

export default Campaign;

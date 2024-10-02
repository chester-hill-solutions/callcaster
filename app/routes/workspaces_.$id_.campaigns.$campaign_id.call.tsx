import {
  json,
  useFetcher,
  useLoaderData,
  useOutletContext,
  redirect,
  useSubmit,
  useNavigation,
  useNavigate,
} from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import useDebouncedSave from "../hooks/useDebouncedSave";
import useSupabaseRoom from "../hooks/useSupabaseRoom";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { SupabaseClient, User } from "@supabase/supabase-js";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "~/lib/callscreenActions";
import { useStartConferenceAndDial } from "~/hooks/useStartConferenceAndDial";
import { Household } from "~/components/CallScreen.Household";
import { toast, Toaster } from "sonner";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { useCallState } from "~/hooks/useCallState";
import { formatTime, playTone } from "~/lib/utils";
import { generateToken } from "./api.token";
import { CampaignHeader } from "~/components/CallScreen.Header";
import { PhoneKeypad } from "~/components/CallScreen.DTMFPhone";
import { CampaignDialogs } from "~/components/CallScreen.Dialogs";
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
import { checkSchedule } from "~/lib/database.server";
interface LoaderData {
  campaign: CampaignType;
  attempts: OutreachAttempt[];
  user: User;
  audiences: Audience[];
  workspaceId: string;
  campaignDetails: LiveCampaign | IVRCampaign;
  contacts: Contact[];
  queue: QueueItem[];
  nextRecipient: QueueItem | null;
  initalCallsList: Call[];
  initialRecentCall: Call | null;
  initialRecentAttempt: OutreachAttempt | null;
  token: string;
  count: number;
  completed: number;
  isActive:boolean;
}

export { ErrorBoundary };


export const loader = async ({ request, params }) => {
  const { campaign_id: id, id: workspaceId } = params;
  const {
    supabaseClient: supabase,
    headers,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);

  if (!serverSession) return redirect("/signin");

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
    supabase.rpc("get_audiences_by_campaign", { selected_campaign_id: id }),
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
    console.error(errors);
    throw "Error fetching campaign data";
  }

  const token = generateToken({
    twilioAccountSid: workspaceData.data.twilio_data.sid,
    twilioApiKey: workspaceData.data.key,
    twilioApiSecret: workspaceData.data.token,
    identity: serverSession.user.id,
  });

  let queue = [];

  if (campaign.data.dial_type === "predictive") {
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
    queue = data;
  } else if (campaign.data.dial_type === "call") {
    const { data, error } = await supabase
      .from("campaign_queue")
      .select(`id, status, contact:contact(*)`)
      .eq("status", serverSession.user.id)
      .eq("campaign_id", id);

    if (error) {
      console.error(error);
      throw error.message || "Error fetching queue data";
    }
    queue = data;
  } else if (!campaign.data.dial_type) {
    return redirect("./../settings");
  }

  const nextRecipient =
    queue && campaign.data.dial_type === "call" ? queue[0] : null;
  const initalCallsList = attempts.data.flatMap((attempt) => attempt.call);
  const initialRecentCall =
    nextRecipient?.contact &&
    initalCallsList.find(
      (call) => call.contact_id === nextRecipient?.contact.id,
    );
  const initialRecentAttempt = attempts.data
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
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
      originalQueue: queue,
      initialRecentAttempt,
      token,
      count: queueCount.count,
      completed: completedCount.count,
      isActive,
    },
    { headers },
  );
};

export const action = async ({ request, params }) => {
  const { campaign_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
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
  const audioContextRef = useRef<AudioContext | null>(null);
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

  const [questionContact, setQuestionContact] = useState<QueueItem | null>(
    initialNextRecipient,
  );

  const [groupByHousehold] = useState<boolean>(true);
  const [update, setUpdate] = useState<object | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
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
    setIsBusy,
  } = useTwilioDevice(token, workspaceId, send);

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
      predictiveQueue: campaign.dial_type === "predictive" ? initialQueue : [],
      queue: campaign.dial_type === "call" ? initialQueue : [],
      callsList: initalCallsList,
      attempts: initialAttempts,
      recentCall: initialRecentCall || null,
      recentAttempt: initialRecentAttempt || null,
      nextRecipient: initialNextRecipient || null,
    },
    contacts,
    campaign_id: campaign.id,
    activeCall,
    setQuestionContact,
    predictive: campaign.dial_type === "predictive",
    setCallDuration,
    setUpdate,
  });

  const [isErrorDialogOpen, setErrorDialog] = useState(
    !Object.keys(campaignDetails?.script || {}).length,
  );
  const [isDialogOpen, setDialog] = useState(
    (!(queue.length > 0) || campaign.dial_type === "predictive") &&
      !isErrorDialogOpen,
  );
  const [isReportDialogOpen, setReportDialog] = useState(false);
  const { begin, conference, setConference } = useStartConferenceAndDial(
    user.id,
    campaign.id,
    workspaceId,
    campaign.caller_id,
  );

  const submit = useSubmit();

  const { startCall } = handleCall({ submit });

  const { handleConferenceStart, handleConferenceEnd } = handleConference({
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

  const handleResponse = useCallback(
    ({ blockId, value }: { blockId: string; value: string | string[] }) => {
      setUpdate((curr) => ({ ...curr, [blockId]: value }));
    },
    [], 
  );

  const handleDialButton = useCallback(() => {
    if (campaign.dial_type === "predictive") {
      if (deviceIsBusy || incomingCall || deviceStatus !== "Registered") {
        console.log("Device Busy", deviceStatus, device.calls.length);
        return;
      }
      begin();
    } else if (campaign.dial_type === "call") {
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
  const { saveData, isSaving } = useDebouncedSave({
    update,
    recentAttempt,
    nextRecipient,
    campaign,
    workspaceId,
    disposition,
    toast,
  });

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

  const requestMicrophoneAccess = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      setStream(mediaStream);
      setPermissionError(null);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      if (error.name === "NotAllowedError") {
        setPermissionError(
          "Microphone access was denied. Please grant permission to use this feature.",
        );
      } else {
        setPermissionError(
          "An error occurred while trying to access the microphone.",
        );
      }
    }
  }, []);

  const handleDTMF = useCallback(
    (key) => {
      if (audioContextRef.current) playTone(key, audioContextRef?.current);
      if (!activeCall) return;
      else {
        activeCall?.sendDigits(key);
      }
    },
    [activeCall],
  );

  const getDisplayState = (
    state: CallState,
    disposition: AttemptDisposition | undefined,
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
  };

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
                recentAttempt?.disposition as AttemptDisposition,
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

  useEffect(() => {
    const handleKeypress = (e) => {
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

  const handleVoiceDrop = () => {
    if (!activeCall) return;
    const formData = new FormData();
    formData.append("callId", activeCall?.parameters?.CallSid);
    formData.append("workspaceId", workspaceId);
    formData.append("campaignId", campaign?.id);

    submit(formData, {
      method: "POST",
      action: "/api/audiodrop",
      navigate: false,
    });
  };

  const requeueContacts = () => {
    const userId = user.id;
    const campaignId = campaign?.id
    submit({userId, campaignId}, {
      method: "DELETE",
      action: "/api/queues",
      encType:"application/json",
      navigate: false,
    });

  }

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
            predictive={campaign.dial_type === "predictive"}
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
            dispositionOptions={campaignDetails.disposition_options}
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

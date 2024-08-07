import {
  json,
  useFetcher,
  useLoaderData,
  useOutletContext,
  redirect,
  useSubmit,
  Form,
  useNavigation,
  NavLink,
} from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import useDebouncedSave, {
  handleQuestionsSave,
} from "../hooks/useDebouncedSave";
import useSupabaseRoom from "../hooks/useSupabaseRoom";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { Tables, ScriptBlocksRoot } from "~/lib/database.types";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  handleCall,
  handleConference,
  handleContact,
  handleQueue,
} from "~/lib/callscreenActions";
import { useStartConferenceAndDial } from "~/hooks/useStartConferenceAndDial";
import { Household } from "~/components/CallScreen.Household";
import { Toaster } from "sonner";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { useCallState } from "~/hooks/useCallState";
import { Button } from "~/components/ui/button";
import InputSelector from "~/components/InputSelector";
import OutputSelector from "~/components/OutputSelector";
import { formatTime, playTone } from "~/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

type Contact = Tables<"contact">;
type Attempt = Tables<"outreach_attempt">;
type User = Tables<"user">;
type Call = Tables<"call">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type Campaign = Tables<"campaign">;
type Audience = Tables<"audience">;
interface CampaignDetails {
  questions: ScriptBlocksRoot;
}

interface LoaderData {
  campaign: Campaign;
  attempts: Attempt[];
  user: User;
  audiences: Audience[];
  workspaceId: string;
  campaignDetails: CampaignDetails;
  contacts: Contact[];
  queue: QueueItem[];
  nextRecipient: QueueItem | null;
  initalCallsList: Call[];
  initialRecentCall: Call | null;
  initialRecentAttempt: Attempt | null;
  token: string;
}

export const loader = async ({ request, params }) => {
  const { campaign_id: id, id: workspaceId } = params;
  const {
    supabaseClient: supabase,
    headers,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);
  if (!serverSession) return redirect("/signin");

  const { token } = await fetch(
    `${process.env.BASE_URL}/api/token?id=${serverSession.user.id}&workspace=${workspaceId}`,
  ).then((res) => res.json());

  const { data: campaign, error: campaignError } = await supabase
    .from("campaign")
    .select()
    .eq("id", id)

    .single();

  const { data: campaignDetails, error: detailsError } = await supabase
    .from("live_campaign")
    .select(`*, script(*)`)
    .eq("campaign_id", id)
    .single();

  const { data: audiences, error: audiencesError } = await supabase.rpc(
    "get_audiences_by_campaign",
    { selected_campaign_id: id },
  );

  const { count, queueCountError } = await supabase
    .from("campaign_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  const { count: completed, queueCompleteError } = await supabase
    .from("campaign_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "dequeued");

  const { data: attempts, error: attemptError } = await supabase
    .from("outreach_attempt")
    .select(`*,call(*)`)
    .eq("campaign_id", id)
    .eq("user_id", serverSession.user.id);
  let queue;
  let queueError;
  if (campaign.dial_type === "predictive") {
    const { data, error } = await supabase
      .from("campaign_queue")
      .select(`*, contact(*)`)
      .in("status", ["queued", serverSession.user.id])
      .eq("campaign_id", id)
      .order("attempts", { ascending: true })
      .order("queue_order", { ascending: true });
    if (error) {
      queueError = error;
    } else {
      queue = data;
    }
  } else if (campaign.dial_type === "call") {
    const { data, error } = await supabase
      .from("campaign_queue")
      .select("*, contact(*)")
      .eq("status", serverSession.user.id)
      .eq("campaign_id", id);
    if (error) {
      queueError = error;
    } else {
      queue = data;
    }
  } else if (!campaign.dial_type) {
    return redirect("./../settings");
  }

  const errors = [
    campaignError,
    detailsError,
    audiencesError,
    attemptError,
    queueError,
    queueCountError,
    queueCompleteError,
  ].filter(Boolean);
  if (errors.length) {
    console.error(errors);
    throw json({ message: "Error fetching campaign data" }, { status: 500 });
  }

  const nextRecipient =
    queue && campaign.dial_type === "call" ? queue[0] : null;
  const initalCallsList = attempts.flatMap((attempt) => attempt.call);
  const initialRecentCall =
    nextRecipient?.contact &&
    initalCallsList.find(
      (call) => call.contact_id === nextRecipient?.contact.id,
    );
  const initialRecentAttempt = attempts
    .sort((a, b) => b.created_at - a.created_at)
    .find((call) => call.contact_id === nextRecipient?.contact?.id);
  return json(
    {
      campaign,
      attempts,
      user: serverSession.user,
      audiences,
      campaignDetails,
      workspaceId,
      queue,
      contacts: queue.map((queueItem) => queueItem.contact),
      nextRecipient,
      initalCallsList,
      initialRecentCall,
      originalQueue: queue,
      initialRecentAttempt,
      token,
      count,
      completed,
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
  } = useLoaderData<LoaderData>();

  const [questionContact, setQuestionContact] = useState<QueueItem | null>(
    initialNextRecipient,
  );
  const [groupByHousehold] = useState<boolean>(true);
  const [update, setUpdate] = useState<Record<string, any>>(
    initialRecentAttempt?.result || null,
  );
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const { state, context, send } = useCallState();
  const {
    device,
    status,
    activeCall,
    incomingCall,
    hangUp,
    callState,
    callDuration,
    setCallDuration,
    deviceIsBusy,
    setIsBusy,
  } = useTwilioDevice(token, workspaceId);

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

  const { status: liveStatus, users: onlineUsers } = useSupabaseRoom({
    supabase,
    workspace: workspaceId,
    campaign: campaign.id,
    userId: user.id,
  });

  const { begin, conference, setConference } = useStartConferenceAndDial(
    user.id,
    campaign.id,
    workspaceId,
    campaign.caller_id,
  );

  const fetcher = useFetcher();
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
    setIsBusy(true);
    if (
      activeCall?.parameters?.CallSid ||
      incomingCall ||
      status !== "Registered" ||
      device?.calls.length > 0
    ) {
      console.log("Device Busy", status, device.calls.length);
      return;
    }
    send({ type: "START_DIALING" });
    if (campaign.dial_type === "predictive") handleConferenceStart();
    if (campaign.dial_type === "call")
      startCall({
        contact: nextRecipient?.contact,
        campaign,
        user,
        workspaceId,
        nextRecipient,
        recentAttempt,
      });
  }, [
    activeCall,
    campaign,
    device,
    handleConferenceStart,
    incomingCall,
    nextRecipient,
    recentAttempt,
    send,
    startCall,
    status,
    user,
    workspaceId,
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

  const handleQuickSave = useCallback(() => {
    handleQuestionsSave(
      update,
      setUpdate,
      recentAttempt,
      submit,
      questionContact,
      campaign,
      workspaceId,
    );
  }, [update, recentAttempt, submit, questionContact, campaign, workspaceId]);

  const handleDequeueNext = useCallback(() => {
    if (campaign.dial_type === "predictive" && nextRecipient) {
      dequeue({ contact: nextRecipient });
      send({ type: "HANG_UP" });
      setRecentAttempt(null);
      setUpdate({});
      setDisposition("idle");
      setCallDuration(0);
      handleDialButton();
    } else if (campaign.dial_type === "call" && nextRecipient) {
      handleQuickSave();
      dequeue({ contact: nextRecipient });
      fetchMore({ householdMap });
      handleNextNumber({ skipHousehold: true });
      send({ type: "HANG_UP" });
      setRecentAttempt(null);
      setUpdate({});
      setDisposition("idle");
      setCallDuration(0);
    }
  }, [
    campaign.dial_type,
    dequeue,
    fetchMore,
    handleDialButton,
    handleNextNumber,
    handleQuickSave,
    householdMap,
    nextRecipient,
    send,
    setRecentAttempt,
    setDisposition,
    setCallDuration,
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
  const displayState = getDisplayState(
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

  useDebouncedSave(
    update,
    recentAttempt,
    submit,
    questionContact,
    campaign,
    workspaceId,
    disposition,
  );
  return (
    <main className="container mx-auto p-6">
      <div
        style={{
          border: "3px solid #BCEBFF",
          alignItems: "stretch",
          flexDirection: "column",
          display: "flex",
          borderRadius: "20px",
        }}
        className="mb-6"
      >
        <div className="flex flex-wrap justify-between px-4">
          <div className="flex flex-col justify-between gap-2 py-4">
            {/* TITLES */}
            <div className="flex max-w-[400px] flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
              <div className="px-1 font-Zilla-Slab">
                <h1 className="text-3xl">{campaign.title}</h1>
                <h4>
                  {count - completed} of {count} remaining
                </h4>
              </div>
              <Form
                method="POST"
                onSubmit={() => {
                  hangUp();
                  device?.destroy();
                }}
              >
                <Button type="submit">Leave Campaign</Button>
              </Form>
            </div>
            {/* Inputs */}
            <div className="flex flex-wrap gap-2 space-y-2 sm:max-w-[500px]">
              {device && <InputSelector device={device} />}
              {device && <OutputSelector device={device} />}
            </div>
          </div>
          {/* Phone with DTMF */}
          <div className={`my-4 border-2 border-[${displayColor}] rounded-lg`}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px",
                background: displayColor,
              }}
              className={`rounded-t-lg font-Tabac-Slab text-white ${state === "connected" || state === "dialing" ? "bg-green-300" : "bg-slate-700"}`}
            >
              <div
                style={{
                  display: "flex",
                  flex: "1",
                  justifyContent: "center",
                }}
              >
                {displayState === "failed" && <div>Call Failed</div>}
                {displayState === "dialing" && (
                  <div>Dialing... {formatTime(callDuration)}</div>
                )}
                {displayState === "connected" && (
                  <div>Connected {formatTime(callDuration)}</div>
                )}
                {displayState === "no-answer" && <div>No Answer</div>}
                {displayState === "voicemail" && <div>Voicemail Left</div>}
                {displayState === "completed" && <div>Call Completed</div>}
                {displayState === "idle" && <div>Pending</div>}
              </div>
            </div>
            <div className="flex w-[130px] flex-wrap justify-between p-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"].map((item, index) => (
                <Button
                  className="m-0.5 h-6 w-6 rounded-xl p-1 text-xs transition-all hover:shadow-inner active:bg-red-900"
                  key={index}
                  onClick={() => handleDTMF(`${item}`)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
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
          handleQuickSave={handleQuickSave}
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
      <Dialog onOpenChange={setDialog} open={isDialogOpen}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center  font-Zilla-Slab text-2xl">
              Welcome to {campaign.title}.
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <p>
                This is a{" "}
                {campaign.dial_type === "call"
                  ? "power dialer campaign. Contacts will load into your queue as you dial."
                  : "predictive dialer campaign. Contacts will be dialed automatically until a conversation is found for you. When you have completed a call, you can press 'Dial' to resume the predictive dialer."}
              </p>
              <br />
              <p>
                {campaign.voicemail_file && campaign.dial_type === "call"
                  ? "The dialer will automatically detect voicemailboxes, and leave a voicemail with the contact."
                  : "The dialer will automatically detect voicemailboxes, and disconnect your call accordingly."}
              </p>
              <div className="mt-4 flex justify-between">
                <Button asChild className="border-primary" variant={"outline"}>
                  <NavLink to={".."} relative="path">
                    Go Back
                  </NavLink>
                </Button>
                <Button
                  onClick={() => {
                    campaign.dial_type === "call" &&
                      fetchMore({ householdMap });
                    setDialog(false);
                  }}
                >
                  Get started
                </Button>
              </div>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setErrorDialog} open={isErrorDialogOpen}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogHeader>
            <DialogTitle className="text-center  font-Zilla-Slab text-2xl">
              NO SCRIPT SET UP
            </DialogTitle>
            <div className="my-4 w-[400px]">
              <p>
                This campaign has not been configured with a script. Contact
                your administrator to get one set up
              </p>

              <div className="mt-4 flex justify-between">
                <Button asChild className="border-primary" variant={"outline"}>
                  <NavLink to={".."} relative="path">
                    Go Back
                  </NavLink>
                </Button>
              </div>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </main>
  );
};

Campaign.ErrorBoundary = ErrorBoundary;

export default Campaign;

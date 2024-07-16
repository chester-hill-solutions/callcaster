import {
  json,
  useFetcher,
  useLoaderData,
  useOutletContext,
  redirect,
  useSubmit,
} from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useCallback } from "react";
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
  const { data: contacts, error: contactsError } = await supabase.rpc(
    "get_contacts_by_campaign",
    { selected_campaign_id: id },
  );

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
      .select()
      .eq("status", "queued")
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
      .select()
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
    contactsError,
    attemptError,
    queueError,
  ].filter(Boolean);
  if (errors.length) {
    console.error(errors);
    throw json({ message: "Error fetching campaign data" }, { status: 500 });
  }

  const initialQueue = queue?.map((q) => ({
    ...q,
    contact: contacts?.find((contact) => contact.id === q.contact_id),
  }));

  const nextRecipient =
    initialQueue && campaign.dial_type === "call" ? initialQueue[0] : null;
  const initalCallsList = attempts.flatMap((attempt) => attempt.call);
  const initialRecentCall = initalCallsList.find(
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
      queue: initialQueue,
      contacts,
      nextRecipient,
      initalCallsList,
      initialRecentCall,
      originalQueue: queue,
      initialRecentAttempt,
      token,
    },
    { headers },
  );
};

export default function Campaign() {
  const { supabase } = useOutletContext<{ supabase: SupabaseClient }>();
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
  } = useLoaderData<LoaderData>();

  const [questionContact, setQuestionContact] = useState<QueueItem | null>(
    initialNextRecipient,
  );

  const [groupByHousehold] = useState<boolean>(true);
  const [update, setUpdate] = useState<Record<string, any>>(
    initialRecentAttempt?.result || null,
  );

  const { state, context, send } = useCallState();
  const { device, status, activeCall, incomingCall, hangUp, callState, callDuration } = useTwilioDevice(
    token,
    workspaceId
  );

  const {
    queue,
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
  });
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
    fetcher,
    submit,
    groupByHousehold,
    campaign,
    workspaceId,
  });

  const handleResponse = useCallback(
    ({ column, value }: { column: string; value: any }) => {
      setUpdate((curr) => ({ ...curr, [column]: value }));
    },
    [],
  );

  const handleDialButton = useCallback(() => {
    if (
      activeCall?.parameters?.CallSid ||
      incomingCall ||
      status !== "Registered"
    )
      return; //Return if not ready to place new call.
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

  const handleDequeueNext = useCallback(() => {
    if (nextRecipient) {
      dequeue({ contact: nextRecipient });
      fetchMore({ householdMap });
      handleNextNumber({ skipHousehold: true });
      setRecentAttempt(null);
    }
  }, [
    dequeue,
    fetchMore,
    handleNextNumber,
    householdMap,
    nextRecipient,
    setRecentAttempt,
  ]);

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

  useEffect(() => {
    if (nextRecipient) {
      setQuestionContact(nextRecipient);
    }
  }, [nextRecipient]);

  useDebouncedSave(
    update,
    recentAttempt,
    submit,
    questionContact,
    campaign,
    workspaceId,
  );
  
  const house =
    householdMap[
      Object.keys(householdMap).find(
        (house) => house === nextRecipient?.contact?.address,
      ) || ""
    ];

  return (
    <main
      className=""
      style={{ padding: "24px", margin: "0 auto", width: "100%" }}
    >
      <div
        className="flex justify-evenly gap-4"
        style={{ justifyContent: "space-evenly", alignItems: "start" }}
      >
        <div className="flex flex-col" style={{ flex: "0 0 20%" }}>
          <CallArea
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
            handleDialNext={handleDialButton}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
            callState={callState}
            callDuration={callDuration}
          />
          <Household
            house={house}
            switchQuestionContact={switchQuestionContact}
            attemptList={attemptList}
          />
        </div>
        <CallQuestionnaire
          {...{
            handleResponse,
            campaignDetails,
            update,
            nextRecipient: questionContact,
            handleQuickSave,
            disabled: !questionContact,
          }}
        />
        <QueueList
          {...{
            householdMap,
            groupByHousehold,
            queue: campaign.dial_type === "call" ? queue : predictiveQueue,
            handleNextNumber,
            nextRecipient,
            handleQueueButton: fetchMore,
            predictive: campaign.dial_type === "predictive",
          }}
        />
      </div>
      <div></div>
      <Toaster richColors />
    </main>
  );
}
Campaign.ErrorBoundary = ErrorBoundary;

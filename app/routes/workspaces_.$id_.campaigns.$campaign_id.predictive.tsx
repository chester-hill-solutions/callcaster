import { useEffect, useState, useCallback, useMemo } from "react";
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
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { useStartConferenceAndDial } from "../hooks/useStartConferenceAndDial";
import useDebouncedSave, {
  handleQuestionsSave,
} from "../hooks/useDebouncedSave";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { CheckCircleIcon } from "lucide-react";
import { Tables, ScriptBlocksRoot } from "~/lib/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

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
  initialConference: any;
  token: string;
}

const limit = 30;

const isRecent = (date: string): boolean => {
  const created = new Date(date);
  const now = new Date();
  return (now.getTime() - created.getTime()) / 3600000 < 24;
};

export const loader = async ({ request, params }) => {
  const { campaign_id: id, id: workspaceId } = params;
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession) return redirect("/signin");
  const { token } = await fetch(
    `${process.env.BASE_URL}/api/token?id=${serverSession.user.id}`,
  ).then((res) => res.json());

  const { data: campaign, error: campaignError } = await supabaseClient
    .from("campaign")
    .select()
    .eq("id", id)
    .single();
  const { data: campaignDetails, error: detailsError } = await supabaseClient
    .from("live_campaign")
    .select()
    .eq("campaign_id", id)
    .single();
  const { data: audiences, error: audiencesError } = await supabaseClient.rpc(
    "get_audiences_by_campaign",
    { selected_campaign_id: id },
  );
  const { data: contacts, error: contactsError } = await supabaseClient.rpc(
    "get_contacts_by_campaign",
    { selected_campaign_id: id },
  ).limit(30);
  const { data: attempts, error: attemptError } = await supabaseClient
    .from("outreach_attempt")
    .select(`*,call(*)`)
    .eq("campaign_id", id);
  const { data: queue, error: queueError } = await supabaseClient
    .from("campaign_queue")
    .select()
    .eq("status", "queued")
    .eq("campaign_id", id)
    .order("attempts", { ascending: true })
    .order("queue_order", { ascending: true });

  let errors = [
    campaignError,
    detailsError,
    audiencesError,
    contactsError,
    attemptError,
    queueError,
  ].filter(Boolean);
  if (errors.length) {
    console.log(errors);
    throw errors;
  }
  const initialQueue = queue?.map((q) => ({
    ...q,
    contact: contacts?.find((contact) => contact.id === q.contact_id),
  })).filter((q) => Boolean(q.contact));

  const nextRecipient = initialQueue[0] || null;
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
      initialConference: null,
      token,
    },
    { headers },
  );
};

export const action = async ({ request, params }) => {
  const { id: workspaceId, campaign_id } = params;
  const update = await request.formData();
  const firstname = await update.get("firstname");
  const surname = await update.get("surname");
  const email = await update.get("email");
  const phone = await update.get("phone");
  const audiences = await update.getAll("audiences");
  const {
    supabaseClient: supabase,
    headers,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);
  try {
    let audienceUpdated = [];
    const { data: contact, error: contactError } = await supabase
      .from("contact")
      .insert({ firstname, surname, email, phone, workspace: workspaceId })
      .select();
    if (contactError) throw contactError;
    for (let i = 0; i < audiences.length; i++) {
      const { data: audience, error: audienceError } = await supabase
        .from("contact_audience")
        .insert({ contact_id: contact[0].id, audience_id: audiences[i] })
        .select();
      if (audienceError) {
        console.log(audienceError);
        throw audienceError;
      }
      if (audience) audienceUpdated.push(audience);
    }
    return json({ success: true, contact, audienceUpdated });
  } catch (e) {
    console.log(e);
    return json({ success: false, error: e });
  }
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
    initalCallsList,
    initialRecentCall,
    initialConference,
    token,
  } = useLoaderData<LoaderData>();
  const [questionContact, setQuestionContact] = useState<QueueItem | null>(
    null,
  );
  const [groupByHousehold] = useState<boolean>(true);
  const [update, setUpdate] = useState<Record<string, any>>({});

  const {
    device,
    status,
    error,
    activeCall,
    incomingCall,
    makeCall,
    hangUp,
    answer,
  } = useTwilioDevice(token);
  const {
    queue,
    callsList,
    attemptList,
    recentCall,
    recentAttempt,
    setRecentAttempt,
    predictiveQueue,
    disposition,
    setDisposition,
    nextRecipient,
    setNextRecipient,
    householdMap,
  } = useSupabaseRealtime({
    user,
    supabase,
    init: {
      queue: [],
      predictiveQueue: initialQueue,
      callsList: initalCallsList,
      attempts: initialAttempts,
      recentCall: initialRecentCall || null,
      recentAttempt: null,
      phoneNumbers: [],
      nextRecipient: null,
    },
    contacts,
    campaign_id: campaign.id,
    predictive: true,
    setQuestionContact,
    workspace: workspaceId,
  });
  
  const fetcher = useFetcher();
  const submit = useSubmit();

  const { begin, conference, setConference } = useStartConferenceAndDial(
    user.id,
    campaign.id,
    workspaceId,
    campaign.caller_id,
    initialConference,
  );

  const handleResponse = useCallback(
    ({ column, value }: { column: string; value: any }) => {
      setUpdate((curr) => ({ ...curr, [column]: value }));
    },
    [],
  );

  const handleDialNext = useCallback(() => {
    if (
      activeCall?.parameters?.CallSid ||
      incomingCall ||
      status !== "Registered"
    ) {
      return;
    }
    handlePowerDial();
    setNextRecipient(null);
    setUpdate({});
  }, [activeCall, incomingCall, status]);

  const handlePowerDial = useCallback(() => {
    if (
      activeCall?.parameters?.CallSid ||
      incomingCall ||
      status !== "Registered"
    ) {
      return;
    }
    begin();
  }, [activeCall, incomingCall, status, begin]);

  const switchToContact = useCallback(
    (contact: QueueItem) => {
      setQuestionContact(contact);
      const newRecentAttempt =
        attemptList.find((call) => call.contact_id === contact.contact.id) ||
        null;
      if (!newRecentAttempt || !isRecent(newRecentAttempt.created_at)) {
        setRecentAttempt(null);
        setUpdate({});
        return;
      }
      const attemptCalls = callsList.filter(
        (call) => call.outreach_attempt_id === newRecentAttempt.id,
      );
      setRecentAttempt({ ...newRecentAttempt, call: attemptCalls });
      setUpdate(newRecentAttempt.result || {});
    },
    [attemptList, callsList, setRecentAttempt],
  );

  const handleEndConference = useCallback(() => {
    submit(
      {},
      { method: "post", action: "/api/auto-dial/end", navigate: false },
    );
    if (activeCall?.parameters?.CallSid) {
      fetch(`/api/hangup`, {
        method: "POST",
        body: JSON.stringify({ callSid: activeCall.parameters.CallSid }),
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }
          return response.json();
        })
        .then(() => {
          activeCall?.disconnect();
          device?.disconnectAll();
        })
        .catch((error) => {
          console.error("Error hanging up call:", error);
        });
    }
    setConference({});
  }, [activeCall, device, submit, setConference]);

  const handleQuickSave = useCallback(() => {
    handleQuestionsSave(
      update,
      recentAttempt,
      submit,
      questionContact,
      campaign,
      workspaceId,
    );
  }, [update, recentAttempt, submit, questionContact, campaign, workspaceId]);

  useEffect(() => {
    setQuestionContact(nextRecipient);
    const newRecentAttempt =
      attemptList.find(
        (call) => call.contact_id === nextRecipient?.contact?.id,
      ) || null;
    setUpdate(newRecentAttempt?.result || {});
  }, [attemptList, nextRecipient]);

  useDebouncedSave(
    update,
    recentAttempt,
    submit,
    questionContact,
    campaign,
    workspaceId,
  );

  const house = nextRecipient?.contact
    ? householdMap[nextRecipient.contact.address] || []
    : [];

  return (
    <div
      className=""
      style={{ padding: "24px", margin: "0 auto", width: "100%" }}
    >
      <div
        className="flex justify-evenly gap-4 "
        style={{ justifyContent: "space-evenly", alignItems: "start" }}
      >
        <div
          className="flex flex-col"
          style={{ minWidth: "20%", flex: "1 1 auto" }}
        >
          <CallArea
            nextRecipient={nextRecipient}
            activeCall={activeCall}
            recentCall={recentCall}
            hangUp={handleEndConference}
            handleDialNext={handleDialNext}
            handleDequeueNext={handleDialNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
            predictive={true}
            conference={conference}
          />
          <div
            style={{
              border: "3px solid #BCEBFF",
              borderRadius: "20px",
              marginBottom: "2rem",
              backgroundColor: "hsl(var(--card))",
              minHeight: "300px",
              alignItems: "stretch",
              flexDirection: "column",
              display: "flex",
              boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTopLeftRadius: "18px",
                borderTopRightRadius: "18px",
                padding: "16px",
                background: "hsl(var(--brand-secondary))",
                width: "100%",
                textAlign: "center",
              }}
              className="font-Tabac-Slab text-xl"
            >
              <div
                style={{ display: "flex", flex: "1", justifyContent: "center" }}
              >
                Household Members
              </div>
            </div>
            {house.map((contact) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div key={contact.id} className="flex justify-center p-2 hover:bg-white" onClick={() => switchToContact(contact)}>
                <div className="flex justify-between items-center flex-auto">
                  <div>{contact.contact?.firstname} {contact.contact?.surname}</div>
                  <div>{attemptList.find((attempt) => attempt.contact_id === contact?.contact_id)?.result.status && <CheckCircleIcon size={"16px"} />}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <CallQuestionnaire
          handleResponse={handleResponse}
          campaignDetails={campaignDetails}
          update={update}
          nextRecipient={questionContact}
          handleQuickSave={handleQuickSave}
        />
        <QueueList
          householdMap={householdMap}
          groupByHousehold={false}
          queue={predictiveQueue}
          handleNextNumber={() => null}
          nextRecipient={nextRecipient}
          predictive={true}
          handleQueueButton={() => null}
        />

      </div>
    </div>
  );
}

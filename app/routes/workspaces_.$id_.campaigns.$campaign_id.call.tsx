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
import { getNextContact } from "../lib/getNextContact";
import useDebouncedSave, {
  handleQuestionsSave,
} from "../hooks/useDebouncedSave";
import useSupabaseRoom from "../hooks/useSupabaseRoom";
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
  const {
    supabaseClient: supabase,
    headers,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);
  if (!serverSession) return redirect("/signin");
  const { token } = await fetch(
    `${process.env.BASE_URL}/api/token?id=${serverSession.user.id}`,
  ).then((res) => res.json());
  const { data: campaign, error: campaignError } = await supabase
    .from("campaign")
    .select()
    .eq("id", id)
    .single();
  const { data: campaignDetails, error: detailsError } = await supabase
    .from("live_campaign")
    .select()
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
  const { data: queue, error: queueError } = await supabase
    .from("campaign_queue")
    .select()
    .eq("status", serverSession.user.id)
    .eq("campaign_id", id);
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
  }));
  const nextRecipient = initialQueue[0] || null;
  const initalCallsList = attempts.flatMap((attempt) => attempt.call);
  const initialRecentCall = initalCallsList.find(
    (call) => call.contact_id === nextRecipient?.contact.id,
  );
  const initialRecentAttempt = attempts
    .sort((a, b) => b.created_at - a.created_at)
    .find((call) => call.contact_id === nextRecipient?.contact.id);
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
    audiences,
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
    initialRecentAttempt?.result || {},
  );

  const {
    status,
    activeCall,
    incomingCall,
    hangUp,
  } = useTwilioDevice(token);
  const {
    queue,
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
      predictiveQueue: [],
      queue: initialQueue,
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
  });
  const { status: liveStatus, users: onlineUsers } = useSupabaseRoom({
    supabase,
    workspace: workspaceId,
    campaign: campaign.id,
    userId: user.id,
  });

  const fetcher = useFetcher();
  const submit = useSubmit();

  const handleResponse = useCallback(
    ({ column, value }: { column: string; value: any }) => {
      setUpdate((curr) => ({ ...curr, [column]: value }));
    },
    [],
  );

  const handleNextNumber = useCallback(
    (skipHousehold = false) => {
      hangUp();

      const nextContact = getNextContact(
        queue,
        householdMap,
        nextRecipient,
        groupByHousehold,
        skipHousehold,
      );
      if (nextContact) {
        setNextRecipient(nextContact);
        const newRecentAttempt =
          attemptList.find(
            (call) => call.contact_id === nextContact.contact.id,
          ) || {};
        if (!isRecent(newRecentAttempt.created_at)) {
          setRecentAttempt({});
          setUpdate({});
          return nextContact;
        }
        const attemptCalls = newRecentAttempt
          ? callsList.filter(
              (call) => call.outreach_attempt_id === newRecentAttempt.id,
            )
          : [];
        setRecentAttempt({ ...newRecentAttempt, call: attemptCalls });
        setUpdate(newRecentAttempt.update || {});
        return nextContact;
      }
      return null;
    },
    [
      attemptList,
      callsList,
      setRecentAttempt,
      groupByHousehold,
      householdMap,
      queue,
      nextRecipient,
    ],
  );

  const switchToContact = useCallback(
    (contact: QueueItem) => {
      setQuestionContact(contact);
      const newRecentAttempt =
        attemptList.find((call) => call.contact_id === contact.contact.id) ||
        {};
      if (!isRecent(newRecentAttempt.created_at)) {
        setRecentAttempt({});
        setUpdate({});
        return contact;
      }
      const attemptCalls = newRecentAttempt
        ? callsList.filter(
            (call) => call.outreach_attempt_id === newRecentAttempt.id,
          )
        : [];
      setRecentAttempt({ ...newRecentAttempt, call: attemptCalls });
      setUpdate(newRecentAttempt.result || {});
    },
    [attemptList, callsList],
  );
  const handlePlaceCall = useCallback(
    (contact: QueueItem) => {
      if (contact.contact.phone) {
        const data = {
          to_number: contact.contact.phone,
          campaign_id: campaign.id,
          user_id: user.id,
          contact_id: contact.contact.id,
          workspace_id: workspaceId,
          outreach_id: recentAttempt?.id,
          queue_id: nextRecipient?.id,
          caller_id: campaign.caller_id,
        };
        submit(data, {
          action: "/api/dial",
          method: "POST",
          encType: "application/json",
          navigate: false,
          fetcherKey: "place-call",
        });
      }
    },
    [submit, campaign, user, workspaceId, recentAttempt, nextRecipient],
  );

  const handleDialNext = useCallback(() => {
    if (
      activeCall?.parameters?.CallSid ||
      incomingCall ||
      status !== "Registered"
    ) {
      return;
    }
    if (nextRecipient) handlePlaceCall(nextRecipient);
  }, [
    activeCall?.parameters?.CallSid,
    incomingCall,
    status,
    nextRecipient,
    handlePlaceCall,
  ]);

  const handleDequeue = useCallback(
    (contact: QueueItem) => {
      submit(
        {
          contact_id: contact.contact.id,
          household: groupByHousehold,
        },
        {
          action: "/api/queues",
          method: "POST",
          encType: "application/json",
          navigate: false,
          fetcherKey: "dequeue",
        },
      );
    },
    [submit, groupByHousehold],
  );

  const handleQueueButton = useCallback(() => {
    fetcher.load(
      `/api/queues?campaign_id=${campaign.id}&workspace_id=${workspaceId}&limit=${Math.max(0, 5 - Object.keys(householdMap).length)}`,
      {
        navigate: false,
      },
    );
  }, [fetcher, campaign.id, workspaceId, householdMap]);

  const handleDequeueNext = useCallback(() => {
    if (nextRecipient) {
      handleDequeue(nextRecipient);
      handleQueueButton();
      handleNextNumber(true);
      setRecentAttempt({});
    }
  }, [nextRecipient, handleDequeue, handleQueueButton, handleNextNumber]);

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
  }, [nextRecipient]);

  useDebouncedSave(
    update,
    recentAttempt,
    submit,
    questionContact,
    campaign,
    workspaceId,
    setUpdate
  );

  const house =
    householdMap[
      Object.keys(householdMap).find(
        (house) => house === nextRecipient?.contact.address,
      ) || ""
    ];
  return (
    <div
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
            hangUp={hangUp}
            handleDialNext={handleDialNext}
            handleDequeueNext={handleDequeueNext}
            disposition={disposition}
            setDisposition={setDisposition}
            recentAttempt={recentAttempt}
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
            {house?.map((contact) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                key={contact.id}
                className="flex justify-center p-2 hover:bg-white"
                onClick={() => switchToContact(contact)}
              >
                <div className="flex flex-auto items-center justify-between">
                  <div>
                    {contact.contact.firstname} {contact.contact.surname}
                  </div>
                  <div>
                    {attemptList.find(
                      (attempt) => attempt.contact_id === contact.contact_id,
                    )?.result.status && <CheckCircleIcon size={"16px"} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            queue,
            handleNextNumber,
            nextRecipient,
            handleQueueButton,
          }}
        />
      </div>
      <div></div>
    </div>
  );
}

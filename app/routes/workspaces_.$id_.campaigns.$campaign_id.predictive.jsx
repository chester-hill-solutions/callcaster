import { json, useFetcher, useLoaderData, useOutletContext, redirect, useSubmit } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server"
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { TopBar } from "../components/CallScreen.TopBar";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import { useStartConferenceAndDial } from "../hooks/useStartConferenceAndDial";
import useDebouncedSave, { handleQuestionsSave } from "../hooks/useDebouncedSave";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { CheckCircleIcon } from "lucide-react";

const limit = 30

const isRecent = (date) => {
    const created = new Date(date);
    const now = new Date();
    return (now - created) / 3600000 < 24;
};

export const loader = async ({ request, params }) => {
    const { campaign_id: id, id: workspaceId } = params;
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    if (!serverSession) return redirect('/signin');
    const { token } = await fetch(
        `${process.env.BASE_URL}/api/token?id=${serverSession.user.id}`,
    ).then((res) => res.json());

    const { data: campaign, error: campaignError } = await supabaseClient.from('campaign').select().eq('id', id).single();
    const { data: campaignDetails, error: detailsError } = await supabaseClient.from('live_campaign').select().eq('campaign_id', id).single();
    const { data: audiences, error: audiencesError } = await supabaseClient.rpc('get_audiences_by_campaign', { selected_campaign_id: id });
    const { data: contacts, error: contactsError } = await supabaseClient.rpc('get_contacts_by_campaign', { selected_campaign_id: id });
    const { data: attempts, error: attemptError } = await supabaseClient.from('outreach_attempt').select(`*,call(*)`,).eq('campaign_id', id);
    const { data: queue, error: queueError } = await supabaseClient.from('campaign_queue').select().eq('status', 'queued').eq('campaign_id', id).order('attempts', { ascending: true }).order('queue_order', { ascending: true });

    let errors = [campaignError, detailsError, audiencesError, contactsError, attemptError, queueError].filter(Boolean);
    if (errors.length) {
        console.log(errors);
        throw (errors)
    }
    const initialQueue = queue?.map(q => ({ ...q, contact: contacts?.find(contact => contact.id === q.contact_id) }));
    const nextRecipient = initialQueue[0] || null;
    const initalCallsList = attempts.flatMap(attempt => attempt.call);
    const initialRecentCall = initalCallsList.find((call) => call.contact_id === nextRecipient?.contact.id)
    const initialRecentAttempt = attempts.sort((a, b) => b.created_at - a.created_at).find((call) => call.contact_id === nextRecipient?.contact.id)
    return json({ campaign, attempts, user: serverSession.user, audiences, campaignDetails, workspaceId, queue: initialQueue, contacts, nextRecipient, initalCallsList, initialRecentCall, originalQueue: queue, initialRecentAttempt, initialConference: null, token }, { headers });
}

export const action = async ({ request, params }) => {
    const { id: workspaceId, campaign_id } = params
    const update = await request.formData();
    const firstname = await update.get('firstname');
    const surname = await update.get('surname');
    const email = await update.get('email');
    const phone = await update.get('phone');
    const audiences = await update.getAll('audiences');
    const { supabaseClient: supabase, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    try {
        let audienceUpdated = []
        const { data: contact, error: contactError } = await supabase.from('contact').insert({ firstname, surname, email, phone, workspace: workspaceId }).select();
        if (contactError) throw contactError;
        for (let i = 0; i < audiences.length; i++) {
            const { data: audience, error: audienceError } = await supabase.from('contact_audience').insert({ contact_id: contact[0].id, audience_id: audiences[i] }).select();
            if (audienceError) {
                console.log(audienceError)
                throw audienceError;
            }
            if (audience) audienceUpdated.push(audience);
        }
        return json({ success: true, contact, audienceUpdated })
    } catch (e) {
        console.log(e)
        return json({ success: false, error: e })
    }
}


export default function Campaign() {
    const { supabase } = useOutletContext();

    const {
        campaign,
        attempts: initialAttempts,
        user,
        workspaceId,
        campaignDetails,
        contacts,
        queue,
        initalCallsList,
        initialRecentCall = {},
        initialConference,
        token
    } = useLoaderData();
    const { device, status, error, activeCall, incomingCall, makeCall, hangUp, answer } = useTwilioDevice(token);
    const [nextRecipient, setNextRecipient] = useState({});
    const [questionContact, setQuestionContact] = useState(nextRecipient);
    const { callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, predictiveQueue } = useSupabaseRealtime({
        setNextRecipient,
        setQuestionContact,
        user,
        supabase,
        init: {
            queue: [],
            predictiveQueue: [...queue],
            callsList: [...initalCallsList],
            attempts: [...initialAttempts],
            recentCall: { ...initialRecentCall },
            recentAttempt: {}

        },
        contacts,
        nextRecipient,
        campaign_id: campaign.id
    })
    const fetcher = useFetcher();
    const submit = useSubmit();
    const [groupByHousehold] = useState(true);
    const [update, setUpdate] = useState(recentAttempt?.result || {});
    const [disposition, setDisposition] = useState(recentAttempt?.disposition || recentAttempt?.result?.status || null);

    const sortQueue = (queue) => {
        return [...queue].sort((a, b) => {
            if (a.attempts !== b.attempts) {
                return b.attempts - a.attempts;
            }
            if (a.id !== b.id) {
                return a.id - b.id;
            }
            return a.queue_order - b.queue_order;
        });
    };

    const householdMap = useMemo(() => {
        const sortedQueue = sortQueue(predictiveQueue);
        return sortedQueue.reduce((acc, curr, index) => {
            if (curr?.contact?.address) {
                if (!acc[curr.contact.address]) {
                    acc[curr.contact.address] = [];
                }
                acc[curr.contact.address].push(curr);
            } else {
                acc[`NO_ADDRESS_${index}`] = [curr];
            }
            return acc;
        }, {});
    }, [queue]);

    const house = nextRecipient?.contact ? householdMap[Object.keys(householdMap).find((house) => house === nextRecipient?.contact.address)] : []

    const { begin, conference, setConference } = useStartConferenceAndDial(user.id, campaign.id, workspaceId, campaign.caller_id, { ...initialConference });
    const handleResponse = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));

    const handleDialNext = () => {
        if (activeCall?.parameters?.CallSid || incomingCall || status !== 'Registered') {
            return;
        }
        handlePowerDial();
        setNextRecipient({});
        setUpdate({})
    };

    const handlePowerDial = () => {
        if (activeCall?.parameters?.CallSid || incomingCall || status !== 'Registered') {
            return;
        }
        begin();
    }
    const switchToContact = (contact) => {
        setQuestionContact(contact);
        const newRecentAttempt = attemptList.find(call => call.contact_id === contact.contact.id) || {};
        if (!isRecent(newRecentAttempt.created_at)) {
            setRecentAttempt({});
            setUpdate({})
            return contact
        }
        const attemptCalls = newRecentAttempt ? callsList.filter((call) => call.outreach_attempt_id === newRecentAttempt.id) : [];
        setRecentAttempt({ ...newRecentAttempt, call: attemptCalls });
        setUpdate(newRecentAttempt.update || {});
    };

    const handleEndConference = () => {
        submit({}, { method: "post", action: '/api/auto-dial/end', navigate: false })
        if (activeCall?.parameters?.CallSid) {
            fetch(`/api/hangup`, {
                method: "POST",
                body: JSON.stringify({ callSid: activeCall.parameters.CallSid }),
                headers: { "Content-Type": 'application/json' }
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(() => {
                    activeCall?.disconnect();
                    device.disconnectAll();
                })
                .catch((error) => {
                    console.error('Error hanging up call:', error);
                })
        }

    }
    useDebouncedSave(update, recentAttempt, submit, nextRecipient, campaign, workspaceId);
    const handleQuickSave = () => {
        handleQuestionsSave(update, recentAttempt, submit, questionContact, campaign, workspaceId)
    }

    useEffect(() => {
        setQuestionContact(nextRecipient)
        const newRecentAttempt = attemptList.find(call => call.contact_id === nextRecipient?.contact?.id) || {};
        setUpdate(newRecentAttempt.update || {});
    }, [attemptList, nextRecipient])


    return (
        <div className="" style={{ padding: '24px', margin: "0 auto", width: "100%" }}>
            <div className="flex justify-evenly gap-4 " style={{ justifyContent: 'space-evenly', alignItems: "start" }}>
                <div className="flex flex-col" style={{ minWidth: "20%", flex: "1 1 auto" }}>
                    <CallArea {...{
                        nextRecipient,
                        activeCall,
                        recentCall,
                        hangUp: handleEndConference,
                        handleDialNext,
                        handleDequeueNext: handleDialNext,
                        disposition,
                        setDisposition,
                        recentAttempt,
                        predictive: true,
                        conference
                    }} />
                    <div style={{
                        border: '3px solid #BCEBFF',
                        borderRadius: "20px",
                        marginBottom: "2rem",
                        backgroundColor: 'hsl(var(--card))',
                        minHeight: "300px",
                        alignItems: "stretch",
                        flexDirection: "column",
                        display: "flex",
                        boxShadow: "3px 5px 0  rgba(50,50,50,.6)",
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: "center",
                            justifyContent: 'space-between',
                            borderTopLeftRadius: '18px',
                            borderTopRightRadius: '18px',
                            padding: "16px",
                            background: "hsl(var(--brand-secondary))",
                            width: '100%',
                            textAlign: "center"
                        }}
                            className="font-Tabac-Slab text-xl"
                        >
                            <div style={{ display: "flex", flex: "1", justifyContent: "center" }}>
                                Household Members
                            </div>
                        </div>
                        {house && house.length > 0 && house?.map((contact) => {
                            if (contact) {
                                return (
                                    <div key={contact.id} className="flex justify-center p-2 hover:bg-white" onClick={() => switchToContact(contact)}>
                                        <div className="flex justify-between items-center flex-auto">
                                            <div>{contact.contact?.firstname} {contact.contact?.surname}</div>
                                            <div>{attemptList.find((attempt) => attempt.contact_id === contact?.contact_id)?.result.status && <CheckCircleIcon size={"16px"} />}</div>
                                        </div>
                                    </div>
                                )
                            }
                        })}
                    </div>
                </div>
                <CallQuestionnaire {...{ handleResponse, campaignDetails, update, nextRecipient: questionContact, handleQuickSave }} />
                <QueueList
                    {...{
                        householdMap,
                        groupByHousehold,
                        queue,
                        handleNextNumber: () => null,
                        nextRecipient,
                        predictive: true
                    }}
                />
            </div>
        </div>
    );
}

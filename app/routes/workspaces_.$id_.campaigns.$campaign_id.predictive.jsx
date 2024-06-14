import { json, useFetcher, useLoaderData, useOutletContext, redirect, useSubmit } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server"
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { TopBar } from "../components/CallScreen.TopBar";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import { useStartConferenceAndDial } from "../hooks/useStartConferenceAndDial";
import { getNextContact } from "../lib/getNextContact";
import useDebouncedSave from "../hooks/useDebouncedSave";

const limit = 30

export const loader = async ({ request, params }) => {
    const { campaign_id: id, id: workspaceId } = params;
    const { supabaseClient, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    if (!serverSession) return redirect('/signin');
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
    return json({ campaign, attempts, user: serverSession.user, audiences, campaignDetails, workspaceId, queue: initialQueue, contacts, nextRecipient, initalCallsList, initialRecentCall, originalQueue: queue, initialRecentAttempt, initialConference: null }, { headers });
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
    const { device: twilioDevice, supabase } = useOutletContext();
    const { device, status, error, activeCall, incomingCall, makeCall, hangUp, answer } = twilioDevice;
    
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
        initialConference
    } = useLoaderData();
    const [nextRecipient, setNextRecipient] = useState({});
    const { callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, setQueue } = useSupabaseRealtime({
        setNextRecipient,
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
    const [disposition, setDisposition] = useState(recentAttempt?.disposition || null);
    const householdMap = useMemo(() =>
        queue.reduce((acc, curr, index) => {
            if (curr?.contact?.address) {
                if (!acc[curr.contact.address]) {
                    acc[curr.contact.address] = [];
                }
                acc[curr.contact.address].push(curr);
            } else {
                acc[`NO_ADDRESS_${index}`] = [curr];
            }
            return acc;
        }, {}), [queue]);
    const house = nextRecipient?.contact ? householdMap[Object.keys(householdMap).find((house) => house === nextRecipient?.contact.address)] : []

    const { begin, conference, setConference } = useStartConferenceAndDial(user.id, campaign.id, workspaceId, campaign.caller_id, { ...initialConference });
    const handleResponse = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));

    const handleDialNext = () => {

        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        }
        if (nextRecipient) {
            handlePowerDial();
        }
    };

    const handlePowerDial = () => {
        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        }
        begin();
    }


    const handleEndConference = () => {
        submit({}, { method: "post", action: '/api/auto-dial/end', navigate: false })
    }
    useDebouncedSave(update, recentAttempt, submit, nextRecipient, campaign, workspaceId);

    return (
        <div className="" style={{ padding: '24px', margin: "0 auto", width: "100%" }}>
            <div className="flex justify-evenly gap-4" style={{ justifyContent: 'space-evenly', alignItems: "start" }}>
                <div className="flex flex-col" style={{ flex: "0 0 20%" }}>
                    <CallArea {...{ nextRecipient, activeCall, recentCall, hangUp: handleEndConference, handleDialNext, handleDequeueNext: () => null, disposition, setDisposition, recentAttempt, predictive: true, conference }} />
                    <div style={{
                        border: '3px solid #BCEBFF',
                        borderRadius: "20px",
                        marginBottom: "2rem",
                        background: '#F1F1F1',
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
                                        <div>{contact?.contact.firstname} {contact?.contact.surname}</div>
                                    </div>
                                )
                            }
                        })}
                    </div>
                </div>
                <CallQuestionnaire {...{ handleResponse, campaignDetails, update }} />
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
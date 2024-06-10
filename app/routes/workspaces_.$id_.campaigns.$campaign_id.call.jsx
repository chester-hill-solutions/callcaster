import { json, useFetcher, useLoaderData, useOutletContext, redirect, useSubmit } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server"
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { TopBar } from "../components/CallScreen.TopBar";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";
import { getNextContact } from "../lib/getNextContact";
import useDebouncedSave from "../hooks/useDebouncedSave";

const limit = 30

export const loader = async ({ request, params }) => {
    const { campaign_id: id, id: workspaceId } = params;
    const { supabaseClient: supabase, headers, serverSession } = await getSupabaseServerClientWithSession(request);
    if (!serverSession) return redirect('/signin');
    const { data: campaign, error: campaignError } = await supabase.from('campaign').select().eq('id', id).single();
    const { data: campaignDetails, error: detailsError } = await supabase.from('live_campaign').select().eq('campaign_id', id).single();
    const { data: audiences, error: audiencesError } = await supabase.rpc('get_audiences_by_campaign', { selected_campaign_id: id });
    const { data: contacts, error: contactsError } = await supabase.rpc('get_contacts_by_campaign', { selected_campaign_id: id });
    const { data: attempts, error: attemptError } = await supabase.from('outreach_attempt').select(`*,call(*)`,).eq('campaign_id', id);
    const { data: queue, error: queueError } = await supabase.from('campaign_queue').select().eq('status', serverSession.user.id).eq('campaign_id', id);
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
    return json({ campaign, attempts, user: serverSession.user, audiences, campaignDetails, workspaceId, queue: initialQueue, contacts, nextRecipient, initalCallsList, initialRecentCall, originalQueue: queue, initialRecentAttempt }, { headers });
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
        audiences,
        workspaceId,
        campaignDetails,
        contacts,
        queue:
        initialQueue,
        nextRecipient: initialNextRecipient,
        initalCallsList,
        initialRecentCall = {},
        initialRecentAttempt
    } = useLoaderData();
    const [nextRecipient, setNextRecipient] = useState(initialNextRecipient);
    const { queue, callsList, attemptList, recentCall, recentAttempt, setRecentAttempt, setQueue } = useSupabaseRealtime({
        user,
        supabase,
        init: {
            queue: [...initialQueue],
            callsList: [...initalCallsList],
            attempts: [...initialAttempts],
            recentCall: { ...initialRecentCall },
            recentAttempt: { ...initialRecentAttempt }

        },
        contacts,
        nextRecipient,
        setNextRecipient
    })
    const fetcher = useFetcher();
    const submit = useSubmit();
    const [groupByHousehold] = useState(true);
    const [update, setUpdate] = useState(recentAttempt?.result || {});
    const [disposition, setDisposition] = useState(recentAttempt?.disposition || null);
    const householdMap = useMemo(() =>
        queue.reduce((acc, curr) => {
            if (curr?.contact?.address) {
                if (!acc[curr.contact.address]) {
                    acc[curr.contact.address] = [];
                }
                acc[curr.contact.address].push(curr);
            }
            return acc;
        }, {}), [queue]);

    const handleResponse = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));

    const handleNextNumber = useCallback((skipHousehold = false) => {
        const nextContact = getNextContact(queue, householdMap, nextRecipient, groupByHousehold, skipHousehold);
        if (nextContact) {
            setNextRecipient(nextContact);
            const newRecentAttempt = attemptList.find(call => call.contact_id === nextContact.contact.id) || {};
            const attemptCalls = newRecentAttempt ? callsList.filter((call) => call.outreach_attempt_id === newRecentAttempt.id) : [];
            setRecentAttempt({ ...newRecentAttempt, call: attemptCalls });
            setUpdate(newRecentAttempt.update || {});
            return nextContact;
        }

        return null;
    }, [attemptList, callsList, setRecentAttempt, groupByHousehold, householdMap, queue, nextRecipient]);

    const handleDialNext = () => {
        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        }
        if (nextRecipient) {
            handlePlaceCall(nextRecipient);
        }
    };

    const handleDequeue = (contact) => {
        submit({
            contact_id: contact.contact.id,
            household: groupByHousehold
        }, {
            action: "/api/queues",
            method: "POST",
            encType: "application/json",
            navigate: false,
            fetcherKey: 'dequeue'
        })
    }

    const handlePlaceCall = (contact) => {
        if (contact.contact.phone) {
            submit({
                to_number: contact.contact.phone,
                campaign_id: campaign.id,
                user_id: user.id,
                contact_id: contact.contact.id,
                workspace_id: workspaceId,
                outreach_id: recentAttempt?.id,
                queue_id: nextRecipient.id,
                caller_id: campaign.caller_id
            }, {
                action: "/api/dial",
                method: "POST",
                encType: "application/json",
                navigate: false,
                fetcherKey: 'place-call'
            });
        }
    };


    const handleQueueButton = () => {
        fetcher.load(`/api/queues?campaign_id=${campaign.id}&workspace_id=${workspaceId}&limit=${5 - Object.keys(householdMap).length}`, {
            navigate: false
        });
    }

    const handleDequeueNext = () => {
        handleDequeue(nextRecipient);
        handleQueueButton();
        handleNextNumber(true);
    }
    useDebouncedSave(update, recentAttempt, submit, nextRecipient, campaign, workspaceId);

    return (
        <div className="" style={{ padding: '24px', margin: "0 auto", width: "100%" }}>

            <div className="flex justify-evenly gap-4" style={{ justifyContent: 'space-evenly', alignItems: "start" }}>
                <CallArea {...{ nextRecipient, activeCall, recentCall, hangUp, handleDialNext, handleDequeueNext, disposition, setDisposition, recentAttempt }} />
                <CallQuestionnaire {...{ handleResponse, campaignDetails, update }} />
                <QueueList
                    {...{
                        householdMap,
                        groupByHousehold,
                        queue,
                        handleNextNumber,
                        nextRecipient,
                        handleQueueButton
                    }}
                />
            </div>
        </div>
    );
}
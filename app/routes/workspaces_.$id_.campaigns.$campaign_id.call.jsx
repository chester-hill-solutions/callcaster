import { json, useFetcher, useLoaderData, useOutletContext, redirect } from "@remix-run/react";
import { createSupabaseServerClient, getSupabaseServerClientWithSession } from "../lib/supabase.server"
import { QueueList } from "../components/CallScreen.QueueList";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSupabaseRealtime } from "../hooks/useSupabaseRealtime";
import { TopBar } from "../components/CallScreen.TopBar";
import { CallArea } from "../components/CallScreen.CallArea";
import { CallQuestionnaire } from "../components/CallScreen.Questionnaire";

const limit = 30

export const loader = async ({ request, params }) => {
    const { campaign_id: id, id: workspaceId } = params;
    const { supabaseClient: supabase, headers, serverSession } = await getSupabaseServerClientWithSession(request);

    const { data: campaign, error: campaignError } = await supabase.from('campaign').select().eq('id', id).single();
    const { data: campaignDetails, error: detailsError } = await supabase.from('live_campaign').select().eq('campaign_id', campaign.id).single();
    const { data: audiences, error: audiencesError } = await supabase.rpc('get_audiences_by_campaign', { selected_campaign_id: id });
    const { data: contacts, error: contactsError } = await supabase.rpc('get_contacts_by_campaign', { selected_campaign_id: id });
    const { data: attempts, error: attemptError } = await supabase.from('outreach_attempt').select(`*,call(*)`,).eq('campaign_id', id);
    const { data: queue, error: queueError } = await supabase.from('campaign_queue').select().eq('status', serverSession.user.id);

    return json({ campaign, attempts, user: serverSession.user, audiences, campaignDetails, workspaceId, queue, contacts }, { headers });
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
    const { campaign, attempts, user, audiences, workspaceId, campaignDetails, contacts, queue: queueIds } = useLoaderData();
    const initialQueue = [];
    for (let i = 0; i < queueIds.length; i++) {
        let contact_id = queueIds[i].contact_id;
        initialQueue.push(contacts.find((contact) => contact.id === contact_id));
    }
    const [callStarted, setCallStarted] = useState(null);
    const fetcher = useFetcher();
    const { submit } = useFetcher();
    const [queue, setQueue] = useState(initialQueue);
    const [groupByHousehold] = useState(true);
    const [callsList] = useSupabaseRealtime('call', supabase, attempts.flatMap(attempt => attempt.call));
    const [nextRecipient, setNextRecipient] = useState(queue[0]);
    const [recentCall, setRecentCall] = useState(callsList.map((call) => call.contact_id === nextRecipient.id ?? {}));
    const [update, setUpdate] = useState(recentCall);
    const householdMap = queue.reduce((acc, curr) => {
        if (!acc[curr.address]) {
            acc[curr.address] = [];
        }
        acc[curr.address].push(curr);
        acc[curr.address].sort((a, b) => a?.phone?.localeCompare(b?.phone));
        return acc;
    }, {});

    const handleResponse = ({ column, value }) => setUpdate((curr) => ({ ...curr, [column]: value }));


    const handleNextNumber = useCallback((skipHousehold = false) => {
        const getNextContact = () => {
            if (groupByHousehold && skipHousehold) {
                for (let currentIndex = Object.keys(householdMap).findIndex(house => house === nextRecipient.address); currentIndex < queue.length; currentIndex++) {
                    for (let i = 0; i < householdMap[Object.keys(householdMap)[currentIndex]].length; i++) {
                        let contact = householdMap[Object.keys(householdMap)[currentIndex]][i];
                        if (contact.phone && contact.address !== nextRecipient.address) {
                            return contact;
                        }
                    }
                }
                for (let currentIndex = 0; currentIndex < Object.keys(householdMap).findIndex(house => house === nextRecipient.address); currentIndex++) {
                    for (let i = 0; i < householdMap[Object.keys(householdMap)[currentIndex]].length; i++) {
                        let contact = householdMap[Object.keys(householdMap)[currentIndex]][i];
                        if (contact.phone && contact.address !== nextRecipient.address) {
                            return contact;
                        }
                    }
                }
            } else {
                for (let currentIndex = queue.findIndex(con => con.id === nextRecipient.id) + 1; currentIndex < queue.length; currentIndex++) {
                    if (queue[currentIndex].phone) {
                        return queue[currentIndex];
                    }
                }
            }
            for (let currentIndex = 0; currentIndex < queue.length; currentIndex++) {
                if (queue[currentIndex].phone) {
                    return queue[currentIndex];
                }
            }
        };

        const nextContact = getNextContact();
        setNextRecipient(nextContact);

        // Update 'update' state with the results of the new nextRecipient's call
        const recentCall = callsList.find(call => call.contact_id === nextContact?.id)?.results ?? {};
        setUpdate(recentCall);

        return nextContact;
    }, [groupByHousehold, householdMap, nextRecipient, queue, attempts]);


    const handleDialNext = () => {
        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        }
        if (nextRecipient) {
            handleCall(nextRecipient);
        }
    };

    const handleCall = (contact) => {
        if (activeCall || incomingCall || status !== 'Registered') {
            return;
        } else {
            handlePlaceCall(contact);
        }
    };

    const handlePlaceCall = (contact) => {
        if (contact.phone) {
            submit({
                to: contact.phone,
                campaign_id: campaign.id,
                user_id: user.id,
                contact_id: contact.id,
                workspaceId,
                queue_id: queueIds.find((id) => id === contact.id)
            }, {
                action: "/api/dial",
                method: "POST",
                encType: "application/json",
                navigate: false
            });
        }
    };


    const handleQueueButton = () => {
        fetcher.load(`/api/queues?campaign_id=${campaign.id}&workspace_id=${workspaceId}&limit=${5 - (householdMap?.length || 0)}`);
    }

    const handleUserJoin = async (presences, queue, householdMap, supabase, currentUser) => {
        try {
            const userIds = presences.map(presence => presence.user_id);
            const usersDetails = userIds.map(userId => {
                return queue.find(contact => contact.user_id === userId) || householdMap[userId];
            });
        } catch (error) {
            console.error('Error handling user join:', error);
        }
    };

    const handleUserLeave = async (state) => {
        console.log('leave', state);
    }

    useEffect(() => {
        fetcher.data && setQueue(fetcher.data);
    }, [fetcher])

    useEffect(() => {
        if (!callStarted && activeCall){
            setCallStarted(Date.now())
        }
    },[callStarted, activeCall])

    useEffect(() => {
        if (nextRecipient) {
            const recentCall = callsList.find((call) => call.contact_id === nextRecipient.id) ?? {};
            setRecentCall(recentCall);
            setUpdate(recentCall);
        }
    }, [nextRecipient, callsList]);

    useEffect(() => {
        const channel = supabase.channel(`${workspaceId}-${campaign.id}`, {
            config: {
                presence: {
                    key: user.id,
                }
            }
        });

        const syncHandler = async (state) => {
            const presences = Object.values(state).flat();
            handleUserJoin(state, queue, householdMap, supabase, user);
        };

        channel.on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();
            syncHandler(newState);
            console.log('sync', newState)
        })
            .on('presence', { event: 'join' }, ({ newPresences }) => handleUserJoin(newPresences, queue, householdMap, supabase, user))
            .on('presence', { event: 'leave' }, ({ leftPresences }) => handleUserLeave(leftPresences))
            .subscribe((e) => {
                if (e !== 'SUBSCRIBED') return;
                channel.track({
                    user_id: user.id,
                    online_at: Date.now(),
                    queue
                });
            });
        return () => {
            channel.unsubscribe();
        };
    }, [campaign.id, supabase, user.id, workspaceId, queue]);

    useEffect(() => {
        const handleQuestionsSave = () => submit({ update, callId: activeCall?.sid }, {
            method: "PATCH",
            navigate: false,
            action: `/api/questions`,
            encType: 'application/json'
        });

        const recentCall = callsList.find(call => call.contact_id === nextRecipient?.id) ?? {};
        const handler = setTimeout(() => {
            if (JSON.stringify(update) !== JSON.stringify(recentCall)) {
                handleQuestionsSave();
            }
        }, 3000);
        return () => {
            clearTimeout(handler);
        };
    }, [callsList, nextRecipient, update, activeCall, submit]);


    return (
        <div className="" style={{ padding: '24px', margin: "0 auto", width: "100%" }}>
            <TopBar {...{ handleQueueButton, state: fetcher.state, handleNextNumber, handleDialNext }} />
            <div className="flex justify-evenly gap-4" style={{ justifyContent: 'space-evenly' }}>
                <CallArea {...{ nextRecipient, activeCall, callStarted, recentCall }} />
                <CallQuestionnaire {...{ handleResponse, campaignDetails, update }} />
                <QueueList
                    {...{
                        groupByHousehold,
                        queue,
                    }}
                />
            </div>
        </div>
    );
}
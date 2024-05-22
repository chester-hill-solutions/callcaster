import { json, useFetcher, useLoaderData, useOutletContext, redirect } from "@remix-run/react";
import { createSupabaseServerClient } from "../lib/supabase.server"
import CallList from "../components/CallList/CallList";
import { useTwilioDevice } from "../hooks/useTwilioDevice";
import { AddIcon } from "../components/Icons";
import { useState } from "react";

const limit = 30
export const loader = async ({ request, params }) => {
    const { campaign_id: id } = params;
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { data, error } = await supabase.auth.getUser();

    if (!data.user) {
        return redirect('/signin');
    }
    let campaignDetails = null;
    let detailsError = null;

    const { data: campaign, error: campaignError } = await supabase.from('campaign').select().eq('id', id).single();
    switch (campaign.type) {
        case 'live_call':
            ({ data: campaignDetails, error: detailsError } = await supabase
                .from('live_campaign')
                .select()
                .eq('campaign_id', campaign.id)
                .single());
            break;
        case 'robocall':
            ({ data: campaignDetails, error: detailsError } = await supabase
                .from('robo_campaign')
                .select()
                .eq('campaign_id', campaign.id)
                .single());
            break;
        default:
            detailsError = new Error("Unknown campaign type");
            break;
    }
    const { data: audiences, error: audiencesError } = await supabase.rpc('get_audiences_by_campaign', { selected_campaign_id: id });
    const { data: contacts, error: contactsError } = await supabase.rpc('get_contacts_by_campaign', { selected_campaign_id: id })
    const { data: calls, error: callError } = await supabase.rpc('get_calls_by_campaign', { selected_campaign_id: id }).order('date_created', { ascending: false });

    return json({ contacts, campaign, calls, user: data.user, audiences, campaignDetails })
}

export const action = async ({ request, params }) => {
    const update = await request.formData();
    const firstname = await update.get('firstname');
    const surname = await update.get('surname');
    const email = await update.get('email');
    const phone = await update.get('phone');
    const audiences = await update.getAll('audiences');
    const { supabaseClient: supabase, headers } = createSupabaseServerClient(request);
    const { data, error } = await supabase.auth.getUser();
    if (!data.user) {
        return redirect('/signin');
    }
    try {
        let audienceUpdated = []
        const { data: contact, error: contactError } = await supabase.from('contact').insert({ firstname, surname, email, phone, organization: 1 }).select();
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
    const { device: twilioDevice } = useOutletContext();
    const { device, status, error, activeCall, incomingCall, makeCall, hangUp, answer } = twilioDevice;
    const { contacts, campaign, calls, user, audiences } = useLoaderData();
    const { submit } = useFetcher();
    const [contactOpen, setContactOpen] = useState(null);
    const [newContact, setNewContact] = useState({
        firstname: '',
        surname: '',
        phone: '',
        email: '',
        audiences: []
    })

    const handlePlaceCall = (contact) => {
        if (contact.phone) {
            submit({
                to: contact.phone,
                campaign_id: campaign.id,
                user_id: user.id,
                contact_id: contact.id,
            }, {
                action: "/api/dial",
                method: "POST",
                encType: "application/json",
                navigate: false
            });
        }
    }
    const openContact = () => {
        setContactOpen(!contactOpen)
    }

    const handleContact = (key, value) => {
        if (key !== 'audiences') {
            setNewContact((curr) => ({ ...curr, [key]: value }));
        } else {
            const values = Array.from(value.target.selectedOptions, option => option.value);
            setNewContact((curr) => ({ ...curr, audiences: values }));
        }
    };

    return (
        <div className="" style={{ padding: '24px', maxWidth: "800px", margin: "0 auto" }}>
            <div className="row flex justify-space-between">
                <h3>{campaign.title}</h3>

            </div>
            <CallList {...{ contacts, calls, placeCall: handlePlaceCall, hangUp, activeCall, incomingCall, contactOpen, newContact, handleContact, audiences, openContact, campaign, device, status }} />
            <div className="row justify-end" style={{ padding: "8px 16px" }}>
                <button onClick={openContact}><AddIcon fill={'#fff'} width="20px" /></button>
            </div>
        </div>
    )
}
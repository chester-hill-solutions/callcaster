import { getSupabaseServerClientWithUser } from "~/lib/supabase.server";
import { json, useFetcher, useLoaderData, useOutletContext } from "@remix-run/react";
import { useState } from "react";
import CallList from "../components/CallList";

export const loader = async ({ request, params }) => {
    const { id } = params;
    const { supabaseClient: supabase, headers, user, workspace } = await getSupabaseServerClientWithUser(request);

    const { data: campaign, error: campaignError } = await supabase.from('campaign').select().eq('id', id).single();
    if (campaignError) throw campaignError;
    const campaignDetailsQuery = campaign.type === 'live_call' ?
        supabase.from('live_campaign').select().eq('campaign_id', campaign.id).single() :
        supabase.from('robo_campaign').select().eq('campaign_id', campaign.id).single();

    const { data: campaignDetails, error: detailsError } = await campaignDetailsQuery;
    if (detailsError) throw detailsError;

    const { data: audiences, error: audiencesError } = await supabase.rpc('get_audiences_by_campaign', { selected_campaign_id: id });
    const { data: contacts, error: contactsError } = await supabase.rpc('get_contacts_by_campaign', { selected_campaign_id: id });
    const { data: calls, error: callError } = await supabase.rpc('get_calls_by_campaign', { selected_campaign_id: id }).order('date_created', { ascending: false });

    return json({ contacts, campaign, calls, user, audiences, campaignDetails });
}

export const action = async ({ request, params }) => {
    const formData = await request.formData();
    const { firstname, surname, email, phone, audiences } = Object.fromEntries(formData.entries());
    const { supabaseClient: supabase, headers } = await getSupabaseServerClientWithUser(request);

    try {
        const { data: contact, error: contactError } = await supabase.from('contact').insert({ firstname, surname, email, phone }).select().single();
        if (contactError) throw contactError;

        const audiencePromises = audiences.map(audienceId =>
            supabase.from('contact_audience').insert({ contact_id: contact.id, audience_id: audienceId }).select()
        );

        const audienceResults = await Promise.all(audiencePromises);
        const audienceErrors = audienceResults.filter(result => result.error);
        if (audienceErrors.length > 0) throw audienceErrors[0].error;

        return json({ success: true, contact, audienceResults });
    } catch (e) {
        console.error(e);
        return json({ success: false, error: e });
    }
}

export default function Campaign() {
    const { twilioDevice } = useOutletContext();
    const { contacts, campaign, calls, user, audiences } = useLoaderData();
    const fetcher = useFetcher();
    const [contactOpen, setContactOpen] = useState(false);
    const [newContact, setNewContact] = useState({
        firstname: '',
        surname: '',
        phone: '',
        email: '',
        audiences: []
    });

    const handlePlaceCall = (contact) => {
        if (contact.phone) {
            fetcher.submit({
                to: contact.phone,
                campaign_id: campaign.id,
                user_id: user.id,
                contact_id: contact.id,
            }, {
                action: "/api/dial",
                method: "POST",
                encType: "application/json",
                replace: false
            });
        }
    };

    const handleContact = (key, value) => {
        setNewContact((curr) => ({ ...curr, [key]: value }));
    };

    const handleAudienceChange = (e) => {
        const values = Array.from(e.target.selectedOptions, option => option.value);
        setNewContact((curr) => ({ ...curr, audiences: values }));
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold">{campaign?.title}</h3>
                <button className="btn-primary" onClick={() => setContactOpen(!contactOpen)}>+</button>
            </div>
            {(twilioDevice.incomingCall || twilioDevice.activeCall) && (
                <button className="btn-danger" onClick={twilioDevice.hangUp}>Hang Up</button>
            )}
            <CallList
                contacts={contacts}
                calls={calls}
                placeCall={handlePlaceCall}
                hangUp={twilioDevice.hangUp}
                activeCall={twilioDevice.activeCall}
                incomingCall={twilioDevice.incomingCall}
                contactOpen={contactOpen}
                newContact={newContact}
                handleContact={handleContact}
                handleAudienceChange={handleAudienceChange}
                audiences={audiences}
                openContact={() => setContactOpen(!contactOpen)}
                campaign={campaign}
            />
        </div>
    );
}

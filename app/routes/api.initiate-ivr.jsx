import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export const action = async ({ request, params }) => {
    const campaignId = 66;
    const userId = 'a656121d-17af-414c-97c7-71f2008f8f14';

    const twiml = new Twilio.twiml.VoiceResponse();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
        .from('campaign_queue')
        .select(
            `
        queue_id:id,
        ...contact(contact_id:id, phone),
        ...campaign(caller_id)
    )
    `,
        ).eq('campaign_id', campaignId).eq('attempts', 0);
    console.log(data);
    for (let i = 0; i < data.length; i++) {
        let contact = data[i];
        await fetch('https://callcaster.ca/api/ivr', {
            body: JSON.stringify({ to_number: contact.phone, user_id: userId, campaign_id: campaignId, workspace_id: "14b73d6e-3e0a-42c8-b8b8-5c536e4cd626", queue_id: contact.queue_id, contact_id: contact.contact_id, caller_id: contact.caller_id }),
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
        }).catch((e) => console.log(e))
    }
    return (data)
}
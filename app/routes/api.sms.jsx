import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const normalizePhoneNumber = (input) => {
    let cleaned = input.replace(/[^0-9+]/g, '');

    cleaned = cleaned.indexOf('+') > 0 ? cleaned.replace(/\+/g, '') : cleaned;
    cleaned = !cleaned.startsWith('+') ? '+' + cleaned : cleaned;

    const validLength = 11;
    const minLength = 11;

    cleaned = cleaned.length < minLength + 1 ? '+1' + cleaned.replace('+', '') : cleaned;

    if (cleaned.length !== validLength + 1) {
        throw new Error('Invalid phone number length');
    }

    return cleaned;
};
const getCampaignData = async ({ supabase, campaign_id }) => {
    const { data: campaign, error } = await supabase
        .from('message_campaign')
        .select()
        .eq('campaign_id', campaign_id)
        .single();
    if (error) throw {campaignError: error};
    return campaign;
};


const sendMessage = async ({ body, to, from, media, supabase, campaign_id, workspace, contact_id }) => {
    const response = new Twilio.twiml.MessagingResponse();
    const message = response.message({
        to,
        from,
        statusCallback: '/api/sms/status'
    })
    message.body(body);
    media && message.media(media);
    const { data, error } = await supabase.from('message').insert({ ...message, campaign_id, workspace, contact_id }).select();
    if (error) throw { 'message_entry_error:': error }
    return { response, data };
}


export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { to_number, campaign_id, workspace_id, contact_id, caller_id } = await request.json();

    let to;

    try {
        to = normalizePhoneNumber(to_number);
    } catch (error) {
        console.error('Invalid phone number:', error);
        return new Response("<Response><Say>Invalid phone number provided. Please try again.</Say></Response>", {
            headers: {
                'Content-Type': 'text/xml'
            },
            status: 400
        });
    }

    try {
        const campaign = await getCampaignData({ supabase, campaign_id });
        let media;
        if (campaign.message_media) {
            media = campaign.message_media;
            //fetch from bucket here.
        }
        const { response, data } = await sendMessage({
            body: campaign.body_text,
            media,
            to,
            from: caller_id,
            supabase,
            campaign_id,
            workspace: workspace_id,
            contact_id
        });
        return new Response(response.toString(), {
            headers: {
                'Content-Type': 'text/xml'
            }
        });
    } catch (error) {
        console.log(error);
        return new Response("<Response><Say>An error occured.</Say></Response>", {
            headers: {
                'Content-Type': 'text/xml'
            },
            status: 400
        });

    }

}

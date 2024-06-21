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
    if (error) throw { campaignError: error };
    return campaign;
};

const sendMessage = async ({ body, to, from, media, supabase, campaign_id, workspace, contact_id }) => {
    console.log(media);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const message = await twilio.messages.create({
        body,
        to,
        from,
        statusCallback: `${process.env.BASE_URL}/api/sms/status`,
        ...(media && media.length > 0 && { mediaUrl: [...media] })
    });
    const {
        sid,
        body: sentBody,
        numSegments: num_segments,
        direction,
        from: sentFrom,
        to: sentTo,
        dateUpdated: date_updated,
        price = 0,
        errorMessage: error_message,
        uri,
        accountSid: account_sid,
        numMedia: num_media,
        status,
        messagingServiceSid: messaging_service_sid,
        dateSent: date_sent,
        dateCreated: date_created,
        errorCode: error_code,
        priceUnit: price_unit,
        apiVersion: api_version,
        subresourceUris: subresource_uris
    } = message;
    const { data, error } = await supabase.from('message').insert({
        sid,
        body: sentBody,
        num_segments,
        direction,
        from: sentFrom,
        to: sentTo,
        date_updated,
        price: (price || null),
        error_message,
        account_sid,
        uri,
        num_media,
        status,
        messaging_service_sid,
        date_sent,
        date_created,
        error_code,
        price_unit,
        api_version,
        subresource_uris,
        campaign_id,
        workspace,
        contact_id
    }).select();
    if (error) throw { 'message_entry_error:': error };
    return { message, data };
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { to_number, campaign_id, workspace_id, contact_id, caller_id } = await request.json();

    let to;

    try {
        to = normalizePhoneNumber(to_number);
    } catch (error) {
        console.error('Invalid phone number:', error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 404
        });
    }

    try {
        const campaign = await getCampaignData({ supabase, campaign_id });
        let media;
        if (campaign.message_media && campaign.message_media.length > 0) {
            media = await Promise.all(campaign.message_media.map(async (media) => {
                const { data, error } = await supabase.storage
                    .from('messageMedia')
                    .createSignedUrl(`${workspace_id}/${media}`, 3600);
                if (error) throw error;
                return data.signedUrl;
            }));
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
        return new Response(JSON.stringify({ data, response }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 201
        });
    } catch (error) {
        console.log(error);
        return new Response(JSON.stringify({ error }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 400
        });
    }
};

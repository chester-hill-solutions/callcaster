import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClientWithSession } from '../lib/supabase.server';

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

const sendMessage = async ({ body, to, from, media, supabase, campaign_id, workspace, contact_id, user_id, queue_id }) => {
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const message = await twilio.messages.create({
        body,
        to,
        from,
        statusCallback: `${process.env.BASE_URL}/api/sms/status`,
        ...(media && media.length > 0 && { mediaUrl: [...media] })
    }).catch(async (error) => {
        console.log(error);
        if (error.code === 21614) {
            const { data: outreach, error: outreachError } = await supabase.rpc('create_outreach_attempt', { con_id: contact_id, cam_id: campaign_id, queue_id: queue_id, wks_id: workspace, usr_id: user_id });
            if (outreachError) throw { 'outreach_error:': outreachUpdateError };
            const { data: outreachUpdate, error: outreachUpdateError } = await supabase.from('outreach_attempt').update({ disposition: 'failed' }).eq('id', outreach).select();
            if (outreachUpdateError) throw { 'outreach_update_error:': outreachUpdateError };
            return { outreachUpdate };

        }
        else throw error;
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
    if (!sid) return { response: message, data: {} };
    const { data: outreach, error: outreachError } = await supabase.rpc('create_outreach_attempt', { con_id: contact_id, cam_id: campaign_id, queue_id: queue_id, wks_id: workspace, usr_id: user_id });
    if (outreachError) throw { 'outreach_error': outreachError };
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
        contact_id,
        outreach_attempt_id: outreach
    }).select();
    if (error) throw { 'message_entry_error:': error };
    return { message, data, outreach };
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    //const { supabaseClient: supabase, headers, serverSession } = getSupabaseServerClientWithSession(request);
    const { to_number, campaign_id, workspace_id, contact_id, caller_id, queue_id } = await request.json();

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
            media = await Promise.all(campaign.message_media.map(async (mediaName) => {
                const { data, error } = await supabase.storage
                    .from('messageMedia')
                    .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
                if (error) console.log(error)
                return data?.signedUrl;
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
            contact_id,
            queue_id,
            user_id: 'a656121d-17af-414c-97c7-71f2008f8f14' //serverSession.user.id
        });
        if (response) {
            await fetch(`${process.env.BASE_URL}/api/queues`, {
                body: JSON.stringify({ contact_id, household: false }),
                method: "POST",
                headers: {
                    "Content-Type": 'application/json'
                }
            }).catch((error) => {
                console.log(error);
                return new Response(JSON.stringify({ error }), {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    status: 400
                });
            }
            )
        }
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

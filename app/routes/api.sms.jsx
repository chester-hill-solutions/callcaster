import { createClient } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance, getCampaignQueueById } from '../lib/database.server';

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
    try {
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: workspace });
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

        if (error) throw new Error(`Failed to insert message data: ${error.message}`);
        return { message, data };
    } catch (error) {
        console.error('Error in sendMessage:', error);
        throw error;
    }
};

export const action = async ({ request }) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    try {
        const { campaign_id, workspace_id, caller_id } = await request.json();

        const campaign = await getCampaignData({ supabase, campaign_id });
        const audience = await getCampaignQueueById({ supabaseClient: supabase, campaign_id });

        let media = [];
        if (campaign.message_media && campaign.message_media.length > 0) {
            media = await Promise.all(campaign.message_media.map(async (mediaItem) => {
                const { data, error } = await supabase.storage
                    .from('messageMedia')
                    .createSignedUrl(`${workspace_id}/${mediaItem}`, 3600);
                if (error) throw new Error(`Failed to create signed URL for media: ${error.message}`);
                return data.signedUrl;
            }));
        }

        const responses = await Promise.all(audience.map(async (member) => {
            try {
                const { message, data } = await sendMessage({
                    body: campaign.body_text,
                    media,
                    to: normalizePhoneNumber(member.contact.phone),
                    from: caller_id,
                    supabase,
                    campaign_id,
                    workspace: workspace_id,
                    contact_id: member.id
                });
                return { [member.contact_id]: { success: true, message, data } };
            } catch (error) {
                console.error(`Error sending message to ${member.contact_id}:`, error);
                return { [member.contact_id]: { success: false, error: error.message } };
            }
        }));

        return new Response(JSON.stringify({ responses }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (error) {
        console.error('Error in action:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
};

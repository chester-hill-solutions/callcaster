import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createWorkspaceTwilioInstance } from '../lib/database.server';
import { Database } from '~/lib/database.types';

const normalizePhoneNumber = (input: string) => {
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

export const sendMessage = async ({ body, to, from, media, supabase, workspace, contact_id }: { body: string, to: string, from: string, media: string, supabase: SupabaseClient<Database>, workspace: string, contact_id: string }) => {
    const mediaData = media && JSON.parse(media);
    console.log(body, to, from, mediaData, workspace, contact_id);
    const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id:workspace});
    try {
        const message = await twilio.messages.create({
            body,
        to,
        from,
        statusCallback: `${process.env.BASE_URL}/api/sms/status`,
        ...(mediaData && mediaData.length > 0 && { mediaUrl: [...mediaData] })
    });
    console.log(message);
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
        subresourceUris: subresource_uris,
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
        workspace,
        ...(contact_id && {contact_id}),
        ...(mediaData && mediaData.length > 0 && { outbound_media: [...mediaData] })
    }).select();    
    if (error) throw { 'message_entry_error:': error };
    return { message, data };
    } catch (error) {
        console.log(`Error sending message: ${error}`);
        return { error: 'Failed to send message' };
    }
};

export const action = async ({ request }: { request: Request }) => {
    const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_KEY as string);
    const { to_number, workspace_id, contact_id, caller_id, body, media } = await request.json() as { to_number: string, workspace_id: string, contact_id: string, caller_id: string, body: string, media: string };
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
        const { message, data } = await sendMessage({
            body: body || " ",
            media,
            to,
            from: caller_id,
            supabase,
            workspace: workspace_id,
            contact_id
        });
        return new Response(JSON.stringify({ data, message }), {
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

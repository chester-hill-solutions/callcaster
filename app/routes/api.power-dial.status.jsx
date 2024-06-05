
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json, redirect } from "@remix-run/react";

export const action = async ({ request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }
    if (parsedBody.StatusCallbackEvent === 'participant-leave' && parsedBody.ReasonParticipantLeft === 'participant_updated_via_api') {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, workspace').eq('sid', parsedBody.CallSid).single();
        await fetch(`${process.env.BASE_URL}/api/power-dial/dialer`, {
            method: 'POST',
            headers: { "Content-Type": 'application/json' },
            body: JSON.stringify({
                user_id: parsedBody.FriendlyName,
                campaign_id: dbCall.campaign_id,
                workspaceId: dbCall.workspace
            })
        })
    }
    if (parsedBody.StatusCallbackEvent === 'participant-join') {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id').eq('sid', parsedBody.CallSid).single();
        const {data: outreachStatus, error: outreachError} = await supabase.from('outreach_attempt').select('contact_id').eq('id', dbCall.outreach_attempt_id).single();
        const {data: queueStatus, error: queueError} = await supabase.from('campaign_queue').update({status: parsedBody.FriendlyName}).eq('contact_id', outreachStatus.contact_id).select();
        /* await fetch(`${process.env.BASE_URL}/api/power-dial/dialer`, {
            method: 'POST',
            headers: { "Content-Type": 'application/json' },
            body: JSON.stringify({
                user_id: parsedBody.FriendlyName,
                campaign_id: dbCall.campaign_id,
                workspaceId: dbCall.workspace
            })
        }) */
    }
    return json(parsedBody)
}
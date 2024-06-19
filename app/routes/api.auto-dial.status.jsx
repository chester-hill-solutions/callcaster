
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json, redirect } from "@remix-run/react";

export const action = async ({ request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }
    let update;
    const { data: dbCall, error: callError } = await supabase.from('call').select().eq('sid', parsedBody.CallSid).single();
    console.log('Call data: ', parsedBody);
    if (parsedBody.StatusCallbackEvent === 'participant-leave'
        && (parsedBody.ReasonParticipantLeft === 'participant_updated_via_api'
            || parsedBody.ReasonParticipantLeft === 'participant_hung_up')) {
        const { data: callUpdate, error: updateError } = await supabase.from('call').update({ end_time: new Date(parsedBody.Timestamp) }).eq('sid', parsedBody.CallSid).select();
        if (updateError) console.error(updateError)
        update = callUpdate;
        const conferences = await twilio.conferences.list({ status: ['in-progress'] });
        if (conferences.length) {
            await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
                method: 'POST',
                headers: { "Content-Type": 'application/json' },
                body: JSON.stringify({
                    user_id: parsedBody.FriendlyName,
                    campaign_id: dbCall.campaign_id,
                    workspace_id: dbCall.workspace,
                    conference_id: parsedBody.ConferenceSid
                })
            })
        }
    }
    if (parsedBody.StatusCallbackEvent === 'participant-join') {

        if (dbCall) {
            if (!dbCall.conference_id) {

                const { data: callUpdate, error: updateError } = await supabase.from('call').update({ conference_id: parsedBody.ConferenceSid, start_time: new Date(parsedBody.Timestamp) }).eq('sid', parsedBody.CallSid).select();
                if (updateError) console.error(updateError)
                update = callUpdate
            }
            if (dbCall.outreach_attempt_id) {
                const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').select('contact_id').eq('id', dbCall.outreach_attempt_id).single();
                const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: parsedBody.FriendlyName }).eq('contact_id', outreachStatus.contact_id).select();
            }
        }
    }
    return json(update)
}

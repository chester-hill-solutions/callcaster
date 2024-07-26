
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json, redirect } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";

export const action = async ({ request }) => {
    const formData = await request.formData();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const parsedBody = {};

    for (const pair of formData.entries()) {
        parsedBody[pair[0]] = pair[1];
    }
    let update;
    const { data: dbCall, error: callError } = await supabase.from('call').select().eq('sid', parsedBody.CallSid).single();
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace });
    if (parsedBody.CallStatus === 'failed') {
        console.log(`Call to ${dbCall.to} failed`)
        const { data: callUpdate, error: updateError } = await supabase.from('call').update({ end_time: new Date(parsedBody.Timestamp), status: 'failed' }).eq('sid', parsedBody.CallSid).select();
        if (updateError) console.error(updateError)
        const { data: attemptUpdate, error: attemptError } = await supabase.from('outreach_attempt').update({ disposition: 'failed' }).eq('id', dbCall.outreach_attempt_id).select();
        if (attemptError) console.error(attemptError)
        const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', attemptUpdate[0].contact_id).select();

        const conferences = await twilio.conferences.list({ friendlyName: callUpdate.conference_id, status: ['in-progress'] });
        console.log(`${conferences.length} active conferences.`)
        if (conferences.length) {
            console.log(callUpdate.conference_id, dbCall.campaign_id)
            await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
                method: 'POST',
                headers: { "Content-Type": 'application/json' },
                body: JSON.stringify({
                    user_id: dbCall.conference_id,
                    campaign_id: dbCall.campaign_id,
                    workspace_id: dbCall.workspace,
                    conference_id: dbCall.conference_id
                })
            })
        }
    }
    if (parsedBody.CallStatus === 'busy') {
        const { data: callUpdate, error: updateError } = await supabase.from('call').update({ end_time: new Date(parsedBody.Timestamp), status: 'busy' }).eq('sid', parsedBody.CallSid).select();
        if (updateError) console.error(updateError)
        const { data: attemptUpdate, error: attemptError } = await supabase.from('outreach_attempt').update({ disposition: 'busy' }).eq('id', dbCall.outreach_attempt_id).select();
        if (attemptError) console.error(attemptError)
        const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', attemptUpdate[0].contact_id).select();

        const conferences = await twilio.conferences.list({ friendlyName: callUpdate.conference_id, status: ['in-progress'] });
        console.log(`${conferences.length} active conferences.`)
        if (conferences.length) {
            console.log(callUpdate.conference_id, dbCall.campaign_id)
            await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
                method: 'POST',
                headers: { "Content-Type": 'application/json' },
                body: JSON.stringify({
                    user_id: dbCall.conference_id,
                    campaign_id: dbCall.campaign_id,
                    workspace_id: dbCall.workspace,
                    conference_id: dbCall.conference_id
                })
            })
        }
    }
    if (parsedBody.CallStatus === 'no-answer') {
        const { data: callUpdate, error: updateError } = await supabase.from('call').update({ end_time: new Date(parsedBody.Timestamp), status: 'no-answer' }).eq('sid', parsedBody.CallSid).select();
        if (updateError) console.error(updateError)
        const { data: attemptUpdate, error: attemptError } = await supabase.from('outreach_attempt').update({ disposition: 'no-answer' }).eq('id', dbCall.outreach_attempt_id).select();
        if (attemptError) console.error(attemptError)
        const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', attemptUpdate[0].contact_id).select();

        const conferences = await twilio.conferences.list({ friendlyName: callUpdate.conference_id, status: ['in-progress'] });
        if (conferences.length) {
            await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
                method: 'POST',
                headers: { "Content-Type": 'application/json' },
                body: JSON.stringify({
                    user_id: dbCall.conference_id,
                    campaign_id: dbCall.campaign_id,
                    workspace_id: dbCall.workspace,
                    conference_id: dbCall.conference_id
                })
            })
        }

    }
    if (parsedBody.StatusCallbackEvent === 'participant-leave'
        && (parsedBody.ReasonParticipantLeft === 'participant_updated_via_api'
            || parsedBody.ReasonParticipantLeft === 'participant_hung_up')) {
        const { data: callUpdate, error: updateError } = await supabase.from('call').update({ end_time: new Date(parsedBody.Timestamp) }).eq('sid', parsedBody.CallSid).select();
        const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'completed', ended_at:new Date() }).eq('id', dbCall.outreach_attempt_id).select();
        const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', outreachStatus[0].contact_id).select();
        update = callUpdate;
        /* const conferences = await twilio.conferences.list({ friendlyName: parsedBody.FriendlyName, status: ['in-progress'] });
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
        } */
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

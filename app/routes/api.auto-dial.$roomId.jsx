import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

export const action = async ({ request, params }) => {
    const conferenceName = params.roomId;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const twilio = new Twilio.Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    const twiml = new Twilio.twiml.VoiceResponse();
    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const answeredBy = formData.get('AnsweredBy');
    const callStatus = formData.get('CallStatus');
    const called = formData.get('Called');
    const dial = twiml.dial();
    const call = twilio.calls(callSid);
    console.log(call)
    try {
        const { data: dbCall, error: callError } = await supabase.from('call').select('campaign_id, outreach_attempt_id, contact_id, workspace').eq('sid', callSid).single();
        if (callError) {
            throw new Error(`Error fetching call data: ${callError.message}`);
        }

        if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
            const { data: campaign, error: campaignError } = await supabase.from('campaign').select('voicemail_file, group_household_queue').eq('id', dbCall.campaign_id).single();
            if (campaignError) {
                throw new Error(`Error fetching campaign data: ${campaignError.message}`);
            }

            const { data: signedUrlData, error: voicemailError } = campaign.voicemail_file ? await supabase.storage.from('workspaceAudio').createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600) : { data: { signedUrl: null }, error: null };
            if (voicemailError) {
                throw new Error(`Error fetching voicemail file: ${voicemailError.message}`);
            }
            const signedUrl = signedUrlData.signedUrl;

            if (campaign.group_household_queue) {
                const { data: contacts, error: householdContactsError } = await supabase.rpc('dequeue_contact', { passed_contact_id: dbCall.contact_id, group_on_household: true });
                if (householdContactsError) {
                    throw new Error(`Error dequeueing household: ${householdContactsError.message}`);
                }
            } else {
                const { data: queueStatus, error: queueError } = await supabase.from('campaign_queue').update({ status: 'dequeued' }).eq('contact_id', dbCall.contact_id).select();
                if (queueError) {
                    throw new Error(`Error updating queue status: ${queueError.message}`);
                }
            }

            const { data: outreachStatus, error: outreachError } = await supabase.from('outreach_attempt').update({ disposition: 'voicemail' }).eq('id', dbCall.outreach_attempt_id).select();
            if (outreachError) {
                throw new Error(`Error updating outreach attempt: ${outreachError.message}`);
            }

            try {
                if (signedUrl) {
                    await call.update({ twiml: `<Response><Pause length="5"/><Play>${signedUrl}</Play></Response>` });
                } else {
                    await call.update({ twiml: `<Response><Hangup/></Response>` });
                }
                const conferences = await twilio.conferences.list({ friendlyName: outreachStatus[0].user_id, status: 'in-progress' });
                if (conferences.length) {
                    await fetch(`${process.env.BASE_URL}/api/auto-dial/dialer`, {
                        method: 'POST',
                        headers: { "Content-Type": 'application/json' },
                        body: JSON.stringify({
                            user_id: outreachStatus[0].user_id,
                            campaign_id: outreachStatus[0].campaign_id,
                            workspace_id: dbCall.workspace,
                        })
                    });

                    return new Response(twiml.toString(), {
                        headers: {
                            'Content-Type': 'text/xml'
                        }
                    });
                } else {
                    if (signedUrl) {
                        await call.update({ twiml: `<Response><Pause length="5"/><Play>${signedUrl}</Play></Response>` });
                    } else {
                        await call.update({ twiml: `<Response><Hangup/></Response>` });
                    }
                    return new Response(twiml.toString(), {
                        headers: {
                            'Content-Type': 'text/xml'
                        }
                    });
                }
            } catch (error) {
                console.error('Error updating call with TwiML:', error);
                throw new Error(`Error updating call with TwiML: ${error.message}`);
            }
        } else {
            if (dbCall.outreach_attempt_id) {
                if (!called.startsWith('client')) {
                    const { data: attempt, error: attemptError } = await supabase.from('outreach_attempt').update({ answered_at: new Date() }).eq('id', dbCall.outreach_attempt_id).select();
                    if (attemptError) {
                        throw new Error(`Error updating outreach attempt: ${attemptError.message}`);
                    }
                }
            }
            dial.conference({
                beep: false,
                statusCallback: `${process.env.BASE_URL}/api/auto-dial/status`,
                statusCallbackEvent: ['join', 'leave', 'modify'],
                endConferenceOnExit: false,
                maxParticipants: 10,
                waitUrl: '',
            }, conferenceName);

            return new Response(twiml.toString(), {
                headers: {
                    'Content-Type': 'text/xml'
                }
            });
        }
    } catch (error) {
        console.error('General error:', error);
        return new Response(`<Response><Hangup/></Response>`, {
            headers: {
                'Content-Type': 'text/xml'
            }
        });
    }
};

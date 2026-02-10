import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { CallInstance, CallContext } from 'twilio/lib/rest/api/v2010/account/call';
import { Call } from "@/lib/types";
import { Database, Tables } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());

const fetchCallData = async (callSid: string): Promise<NonNullable<Partial<Call>>> => {
    const { data, error } = await supabase.from('call').select('campaign_id, outreach_attempt_id, contact_id, workspace, conference_id').eq('sid', callSid).single();
    if (error) throw new Error(`Error fetching call data: ${error.message}`);
    return data;
};

const fetchCampaignData = async (campaignId: string) => {
    const { data, error } = await supabase.from('campaign').select('voicemail_file, group_household_queue, caller_id').eq('id', campaignId).single();
    if (error) throw new Error(`Error fetching campaign data: ${error.message}`);
    return data;
};

const getVoicemailSignedUrl = async (workspace: string, voicemailFile: string) => {
    if (!voicemailFile) return null;
    const { data, error } = await supabase.storage.from('workspaceAudio').createSignedUrl(`${workspace}/${voicemailFile}`, 3600);
    if (error) throw new Error(`Error fetching voicemail file: ${error.message}`);
    return data.signedUrl;
};

const dequeueContact = async (contactId: string, groupOnHousehold: boolean, userId: string) => {
    if (groupOnHousehold) {
        const { data, error } = await supabase.rpc('dequeue_contact', {
            passed_contact_id: contactId,
            group_on_household: groupOnHousehold,
            dequeued_by_id: userId,
            dequeued_reason_text: "Auto-dial completed"
        });
        if (error) throw new Error(`Error dequeueing household: ${error.message}`);
        return data;
    } else {
        const { data, error } = await supabase.from('campaign_queue').update({
            status: 'dequeued',
            dequeued_by: userId,
            dequeued_at: new Date().toISOString(),
            dequeued_reason: "Auto-dial completed"
        }).eq('contact_id', contactId).select();
        if (error) throw new Error(`Error updating queue status: ${error.message}`);
        return data;
    }
};

const updateOutreachAttempt = async (attemptId: string, update: Partial<Tables<"outreach_attempt">>) => {
    const { data, error } = await supabase.from('outreach_attempt').update(update).eq('id', attemptId).select();
    if (error) throw new Error(`Error updating outreach attempt: ${error.message}`);
    return data;
};

const triggerAutoDialer = async (conferenceId: string, campaignId: string, workspaceId: string) => {
    await fetch(`${env.BASE_URL()}/api/auto-dial/dialer`, {
        method: 'POST',
        headers: { "Content-Type": 'application/json' },
        body: JSON.stringify({ user_id: conferenceId, campaign_id: campaignId, workspace_id: workspaceId })
    });
};

type OutreachStatusItem = {
  user_id: string | number;
  campaign_id: string | number;
};

const handleMachineAnswer = async (
    call: CallContext,
    twilio: Twilio.Twilio,
    dbCall: NonNullable<Partial<Call>>,
    campaign: NonNullable<Partial<Tables<"campaign">>>,
    signedUrl: string,
    outreachStatus: OutreachStatusItem[]
) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    await dequeueContact(dbCall.contact_id?.toString() ?? '', campaign.group_household_queue ?? false, outreachStatus[0].user_id?.toString() ?? '');

    const conferences = await twilio.conferences.list({ friendlyName: outreachStatus[0].user_id?.toString() ?? '', status: 'in-progress' });
    if (conferences.length) {
        await triggerAutoDialer(outreachStatus[0].user_id?.toString() ?? '', outreachStatus[0].campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '');
    }

    const playTwiml = `<Response><Pause length="5"/><Play>${signedUrl}</Play></Response>`;
    await call.update({ twiml: playTwiml });

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleHumanAnswer = async (dbCall: NonNullable<Partial<Call>>, conferenceName: string, called: string) => {
    const twiml = new Twilio.twiml.VoiceResponse();

    if (dbCall.outreach_attempt_id && !called.startsWith('client')) {
        await updateOutreachAttempt(dbCall.outreach_attempt_id?.toString() ?? '', { answered_at: new Date().toISOString() });
    }

    const dial = twiml.dial();
    dial.conference({
        beep: 'onExit',
    }, `${conferenceName}`);

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleDeviceCheck = async (dbCall: NonNullable<Partial<Call>>) => {
    return await addToConference(dbCall.conference_id?.toString() ?? '', dbCall.campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '');
};

async function addToConference(conferenceId: string, campaignId: string, workspaceId: string) {
    const twiml = new Twilio.twiml.VoiceResponse();
    const dial = twiml.dial();
    dial.conference({
        beep: 'false',
        statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
        endConferenceOnExit: false,
    }, conferenceId);
    await triggerAutoDialer(conferenceId, campaignId, workspaceId);
    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
}

const checkUserDevices = async (contactId: string, conferenceName: string, called: string, callerId: string) => {
    const { data, error } = await supabase
        .from('user')
        .select('verified_audio_numbers')
        .eq('id', conferenceName)
        .single();
    if (error) throw new Error(`Error fetching user devices: ${error.message}`);
    if (!data || !data.verified_audio_numbers) return false;
    if (called.includes('client')) return true;
    if (called === callerId) return true;
    if (!contactId && data.verified_audio_numbers.includes(called)) return true;
    return false;
}

export const action = async ({ request, params }: { request: Request, params: { roomId: string } }) => {
    const conferenceName = params.roomId;
    const realtime = supabase.realtime.channel(conferenceName)
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const callStatus = formData.get('CallStatus') as string;
    const called = formData.get('Called') as string;

    let response: Response;
    
    try {
        const dbCall = await fetchCallData(callSid);
        const campaign = await fetchCampaignData(dbCall.campaign_id?.toString() ?? '');

        if (await checkUserDevices(dbCall.contact_id?.toString() ?? '', conferenceName, called, campaign.caller_id?.toString() ?? '')) {
            return await handleDeviceCheck(dbCall);
        } else {
            //This is a non-client device (outbound call)
            const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace ?? '' });
            const call: CallContext = twilio.calls(callSid);
            realtime.send({
                type: "broadcast", event: "message", payload: {
                    contact_id: dbCall.contact_id,
                    status: callStatus
                }
            });

            if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
                //This is an answering machine
                const campaign = await fetchCampaignData(dbCall.campaign_id?.toString() ?? '');
                const signedUrl = await getVoicemailSignedUrl(dbCall.workspace?.toString() ?? '', campaign.voicemail_file?.toString() ?? '');
                const outreachStatus = await updateOutreachAttempt(dbCall.outreach_attempt_id?.toString() ?? '', { disposition: 'voicemail' });
                supabase.removeChannel(realtime);
                if (signedUrl) {
                    response = await handleMachineAnswer(call, twilio, dbCall, campaign, signedUrl, outreachStatus);
                } else {
                    //No voicemail file found, so we hang up
                    response = new Response(`<Response><Hangup/></Response>`, {
                        headers: { 'Content-Type': 'text/xml' }
                    });
                }
            } else {
                //This is a human answer
                response = await handleHumanAnswer(dbCall, conferenceName, called?.toString() ?? '');
            }
        }
    } catch (error) {
        logger.error('General error:', error);
        response = new Response(`<Response><Hangup/></Response>`, {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    return response;
};
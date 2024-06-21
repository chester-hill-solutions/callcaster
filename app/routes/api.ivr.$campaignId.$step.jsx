import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

export const action = async ({ request, params }) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const campaign_id = params.campaignId;
    const step = params.step;

    try {
        // Fetch call details
        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('campaign_id, outreach_attempt_id, contact_id, workspace')
            .eq('sid', callSid)
            .single();

        if (callError) throw callError;
        console.log(dbCall)
        const { data: campaign, error: campaignError } = await supabase
            .from('ivr_campaign')
            .select()
            .eq('campaign_id', campaign_id)
            .single();

        if (campaignError) throw campaignError;

        const stepData = campaign.step_data.find((i) => i.step == step);
        const { speechType, say, responseType } = stepData;

        if (responseType === 'hangup') {
            if (speechType === 'recorded') {
                const { data: signedUrlData, error: voicemailError } = await supabase
                    .storage
                    .from('workspaceAudio')
                    .createSignedUrl(`${dbCall.workspace}/${say}`, 3600);

                if (voicemailError) throw voicemailError;

                twiml.play(signedUrlData.signedUrl);
            } else {
                twiml.say(say);
            }
            twiml.hangup();
        } else {
            let gather = twiml.gather({
                action: `/api/ivr/${campaign_id}/${step}/${dbCall.outreach_attempt_id}`,
                input: responseType,
            });

            if (speechType === 'recorded') {
                const { data: signedUrlData, error: voicemailError } = await supabase
                    .storage
                    .from('workspaceAudio')
                    .createSignedUrl(`${dbCall.workspace}/${say}`, 3600);

                if (voicemailError) throw voicemailError;

                gather.play(signedUrlData.signedUrl);
            } else {
                gather.say(say);
            }
        }

    } catch (e) {
        console.error(e);
        return new Response("<Response><Say>An error occurred. Please try again later.</Say></Response>", {
            headers: {
                'Content-Type': 'text/xml'
            },
            status: 500
        });
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
};

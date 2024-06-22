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
        const [callResult, campaignResult] = await Promise.all([
            supabase
                .from('call')
                .select('campaign_id, outreach_attempt_id, contact_id, workspace')
                .eq('sid', callSid)
                .single(),
            supabase
                .from('ivr_campaign')
                .select()
                .eq('campaign_id', campaign_id)
                .single()
        ]);

        const dbCall = callResult.data;
        const campaign = campaignResult.data;

        if (callResult.error) throw callResult.error;
        if (campaignResult.error) throw campaignResult.error;

        const stepData = campaign.step_data.find((i) => i.step == step);
        const { speechType, say, responseType } = stepData;

        let signedUrlData = null;
        if (speechType === 'recorded') {
            const signedUrlResult = await supabase
                .storage
                .from('workspaceAudio')
                .createSignedUrl(`${dbCall.workspace}/${say}`, 3600);

            signedUrlData = signedUrlResult.data;
            if (signedUrlResult.error) throw signedUrlResult.error;
        }

        if (responseType === 'hangup') {
            if (speechType === 'recorded') {
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

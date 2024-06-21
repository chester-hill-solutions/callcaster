import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

export const getCampaignData = async (supabase, campaign_id) => {
    const { data: campaign, error } = await supabase
        .from('ivr_campaign')
        .select()
        .eq('campaign_id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

const getExistingResult = async (supabase, outreach_attempt_id) => {
    const { data: existing, error } = await supabase
        .from('outreach_attempt')
        .select('result')
        .eq('id', outreach_attempt_id)
        .maybeSingle();
    if (error) throw error;
    return existing;
};

const updateResult = async (supabase, outreach_attempt_id, result) => {
    const { error } = await supabase
        .from('outreach_attempt')
        .update({ result })
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

const handleRedirection = (twiml, campaign_id, nextStep, currentStep) => {
    nextStep 
        ? twiml.redirect(`/api/ivr/${campaign_id}/${nextStep}`) 
        : twiml.redirect(`/api/ivr/${campaign_id}/${currentStep}`);
};

const handleVoiceResponse = (twiml, campaign_id, stepData, formData) => {
    const vxKeys = Object.keys(stepData.nextStep).filter(key => key.startsWith('vx'));
    const anyKey = vxKeys.find(key => key.includes('any'));
    anyKey 
        ? twiml.redirect(`/api/ivr/${campaign_id}/${stepData.nextStep[anyKey]}`) 
        : twiml.say("Sorry, I didn't understand that. Please try again.");
};

export const action = async ({ request, params }) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const userInput = formData.get('Digits') || formData.get('SpeechResult');
    const campaign_id = params.campaignId;
    const step = params.step;
    const outreach_attempt_id = parseInt(params.responseId);

    try {
        const campaign = await getCampaignData(supabase, campaign_id);
        const stepData = campaign.step_data.find(i => i.step == step);
        const existing = await getExistingResult(supabase, outreach_attempt_id);
        const updatedResult = { ...existing?.result, [step]: userInput };

        await updateResult(supabase, outreach_attempt_id, updatedResult);

        const nextStep = stepData.nextStep[userInput];

        formData.get('SpeechResult') 
            ? handleVoiceResponse(twiml, campaign_id, stepData, formData) 
            : handleRedirection(twiml, campaign_id, nextStep, step);

        if (!nextStep && !formData.get('SpeechResult')) {
            twiml.say('Thank you so much for your time. Have a great day!');
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

import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

const getCampaignData = async (supabase, campaign_id) => {
    const { data: campaign, error } = await supabase
        .from('campaign')
        .select(`*, ivr_campaign(*, script(*))`)
        .eq('id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

export const action = async ({ params, request }) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const twiml = new Twilio.twiml.VoiceResponse();
    
    const { pageId, campaignId } = params;
    const url = new URL(request.url);
    const callSid = url.searchParams.get('CallSid');

    try {
        const campaignData = await getCampaignData(supabase, campaignId);
        
        const script = campaignData.ivr_campaign[0].script.steps;
        const currentPage = script.pages[pageId];

        if (currentPage && currentPage.blocks.length > 0) {
            const firstBlockId = currentPage.blocks[0];
            twiml.redirect(`/api/ivr/${campaignId}/${pageId}/${firstBlockId}`);
        } else {
            twiml.say("There was an error in the IVR flow. Goodbye.");
            twiml.hangup();
        }
    } catch (e) {
        console.error(e);
        twiml.say("An error occurred. Please try again later.");
        twiml.hangup();
    }

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'application/xml' }
    });
};
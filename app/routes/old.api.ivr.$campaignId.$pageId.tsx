import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

const getCallData = async (supabase, callId) => {
    const {data, error} = await supabase.from('call').select().eq('sid', callId).single();
    if (error) throw error;
    return data;
};

const getCampaignData = async (supabase, campaign_id) => {
    const { data: campaign, error } = await supabase
        .from('campaign')
        .select(`*, ivr_campaign(*, script(*))`)
        .eq('id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

const handleBlock = async (supabase, twiml, block, dbCall, campaign_id, pageId, blockId, outreach_attempt_id) => {
    const { type, audioFile, options } = block;

    if (type === 'recorded') {
        const { data: signedUrlData, error: signedUrlError } = await supabase
            .storage
            .from('workspaceAudio')
            .createSignedUrl(`${dbCall.workspace}/${audioFile}`, 3600);

        if (signedUrlError) throw signedUrlError;

        twiml.play(signedUrlData.signedUrl);
    } else {
        twiml.say(audioFile);
    }

    if (options && options.length > 0) {
        let gather = twiml.gather({
            action: `/api/ivr/${campaign_id}/${pageId}/${blockId}/${outreach_attempt_id}`,
            input: 'dtmf speech',
            speechTimeout: 'auto',
            speechModel: 'phone_call',
        });

        const hints = options.map(opt => opt.content).filter(Boolean).join(' ');
        if (hints) {
            gather.say(`You can say ${hints}, or press the corresponding number.`);
        }
    } else {
        // If there are no options, we need to move to the next block or page
        twiml.redirect(`/api/ivr/${campaign_id}/${pageId}/${outreach_attempt_id}`);
    }
};

export const action = async ({ request, params }) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const twiml = new Twilio.twiml.VoiceResponse();
    const formData = await request.formData();
    const { campaignId, pageId, blockId } = params;
    const callId = formData.get('CallSid');
    
    try {
        const campaignData = await getCampaignData(supabase, campaignId);
        const callData = await getCallData(supabase, callId);
        const script = campaignData.ivr_campaign[0].script.steps;
        const currentPage = script.pages[pageId];

        if (blockId) {
            const currentBlock = script.blocks[blockId];
            await handleBlock(supabase, twiml, currentBlock, callData, campaignId, pageId, blockId, callData.outreach_attempt_id);
        } else {
            const nextBlockId = currentPage.blocks.find(id => !callData.processed_blocks?.includes(id));
            
            if (nextBlockId) {
                twiml.redirect(`/api/ivr/${campaignId}/${pageId}/${nextBlockId}/${callData.outreach_attempt_id}`);
            } else {
                const pageIds = Object.keys(script.pages);
                const currentPageIndex = pageIds.indexOf(pageId);
                const nextPageId = pageIds[currentPageIndex + 1];

                if (nextPageId) {
                    twiml.redirect(`/api/ivr/${campaignId}/${nextPageId}/${callData.outreach_attempt_id}`);
                } else {
                    twiml.say("Thank you for your time. Goodbye!");
                    twiml.hangup();
                }
            }
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
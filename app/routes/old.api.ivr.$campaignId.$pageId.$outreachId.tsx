import { createClient } from '@supabase/supabase-js';
import type { ActionFunctionArgs } from "@remix-run/node";

interface CampaignData {
  ivr_campaign: Array<{
    script: {
      steps: {
        pages: Record<string, any>;
        blocks: Record<string, any>;
      };
    };
  }>;
}

interface Block {
  options?: Array<{
    value: string;
    content: string;
    next: string;
  }>;
}

interface Result {
  visitedPages?: string[];
  [key: string]: any;
}

const getCampaignData = async (supabase: any, campaign_id: string): Promise<CampaignData> => {
    const { data: campaign, error } = await supabase
        .from('campaign')
        .select(`*, ivr_campaign(*, script(*))`)
        .eq('id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

const updateResult = async (supabase: any, outreach_attempt_id: string, result: Result) => {
    const { error } = await supabase
        .from('outreach_attempt')
        .update({ result })
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    
    const formData = await request.formData();
    const userInput = (formData.get('Digits') || formData.get('SpeechResult')) as string;
    const { campaignId, pageId, responseId } = params;

    try {
        const campaignData = await getCampaignData(supabase, campaignId!);
        const script = campaignData.ivr_campaign[0].script.steps;
        const currentPage = script.pages[pageId!];

        const { data: existing } = await supabase
            .from('outreach_attempt')
            .select('result')
            .eq('id', responseId)
            .single();

        const updatedResult: Result = { 
            ...existing?.result, 
            [pageId!]: userInput,
            visitedPages: [...(existing?.result?.visitedPages || []), pageId!]
        };
        await updateResult(supabase, responseId!, updatedResult);

        let nextPageId: string | null = null;
        for (const blockId of currentPage.blocks) {
            const currentBlock = script.blocks[blockId] as Block;
            if (currentBlock.options && currentBlock.options.length > 0) {
                const matchedOption = currentBlock.options.find(option => 
                    (userInput && option.value === userInput) || 
                    (userInput && option.value === 'vx-any') ||
                    (userInput && typeof userInput === 'string' && userInput.toLowerCase().includes(option.content.toLowerCase()))
                );
                if (matchedOption) {
                    nextPageId = matchedOption.next;
                    break;
                }
            }
        }
        
        if (nextPageId && !updatedResult.visitedPages?.includes(nextPageId)) {
            return Response.redirect(`${process.env.BASE_URL}/api/ivr/${campaignId}/${nextPageId}/${responseId}`, 303);
        } else {
            return Response.redirect(`${process.env.BASE_URL}/api/ivr/${campaignId}/end/${responseId}`, 303);
        }

    } catch (e) {
        console.error(e);
        return Response.redirect(`${process.env.BASE_URL}/api/ivr/${campaignId}/error`, 303);
    }
};
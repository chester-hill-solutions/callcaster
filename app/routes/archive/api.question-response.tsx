import { json } from "@remix-run/node";
import { createClient } from '@supabase/supabase-js';
import type { ActionFunctionArgs } from "@remix-run/node";
import { logger } from "@/lib/logger.server";

interface CallData {
  id: string;
  responses: Record<string, any>;
  current_question: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
    const CallSid = formData.get('CallSid') as string;
    const SpeechResult = formData.get('SpeechResult') as string;
    const questionIndex = url.searchParams.get('questionIndex');
    const baseUrl = env.BASE_URL();
    const { data: old, error: oldError } = await supabase
        .from('calls')
        .select()
        .eq('id', CallSid)
        .single();

    if (oldError) {
        logger.error('Error fetching call data:', oldError);
        return json({ status: 'error', message: 'Failed to fetch call data' }, 500);
    }

    const responses = old.responses || {};
    responses[questionIndex!] = { SpeechResult };

    const update: CallData = {
        id: CallSid, 
        responses,
        current_question: old.current_question + 1
    };

    const { data, error } = await supabase
        .from('calls')
        .upsert(update, { returning: "minimal" }); 

    if (error) {
        logger.error('Error updating call data:', error);
        return json({ status: 'error', message: 'Failed to update call data' }, 500);
    }

    return new Response(`<Response><Redirect>/api/handle-questions</Redirect></Response>`.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}

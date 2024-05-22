import { json } from "@remix-run/node";
import { createClient } from '@supabase/supabase-js';

export const action = async ({ request }) => {
    const formData = await request.formData();
    const url = new URL(request.url);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SKEY);
    const CallSid = formData.get('CallSid');
    const SpeechResult = formData.get('SpeechResult');
    const questionIndex = url.searchParams.get('questionIndex');
    const baseUrl = process.env.BASE_URL
    const { data: old, error: oldError } = await supabase
        .from('calls')
        .select()
        .eq('id', CallSid)
        .single();

    if (oldError) {
        console.error('Error fetching call data:', oldError);
        return json({ status: 'error', message: 'Failed to fetch call data' }, 500);
    }

    const responses = old.responses || {};
    responses[questionIndex] = { SpeechResult };

    const update = {
        id: CallSid, 
        responses,
        current_question: old.current_question + 1
    };

    const { data, error } = await supabase
        .from('calls')
        .upsert(update, { returning: "minimal" }); 

    if (error) {
        console.error('Error updating call data:', error);
        return json({ status: 'error', message: 'Failed to update call data' }, 500);
    }

    return new Response(`<Response><Redirect>/api/handle-questions</Redirect></Response>`.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}

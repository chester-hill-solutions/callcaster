import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";

interface CallData {
  current_question: number;
  responses: any[];
  previous_status?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const twiml = new Twilio.twiml.VoiceResponse();

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SKEY);
        const formData = await request.formData();
        const CallSid = formData.get('CallSid') as string;
        const toNumber = formData.get('To') as string;
        const fromNumber = formData.get('From') as string;
        const baseUrl = process.env.BASE_URL

        let { data, error } = await supabase.from('calls').select('*').eq('id', CallSid).single();

        if (error || !data) {

            const { data: newData, error: newDataError } = await supabase.from('calls').insert({ id: CallSid });
            if (newDataError) throw newDataError;
            data = { current_question: 0, responses: [] } as CallData;
        }
        
        const questions = [
            "Are you planning to vote on June the 10th?",
            "How would you rate your support for Dipika Damerla on a scale from 1 to 5?",
            "Is there a specific issue that you consider when you are making that ranking?",
            "Are you interested in hearing from Dipika?"
        ];
        if (data.current_question === 0 && data.previous_status != 'failed') {
            twiml.say({ voice: 'Polly.Amy-Neural' }, 'Hey there, we are conducting a survey on behalf of a political candidate in your area. Is it alright if we ask 5 quick questions?');
            twiml.pause({ length: 3 })
            twiml.say({ voice: 'Polly.Amy-Neural' }, 'Thanks so much! Here we go')
        }
        if (data.previous_status && data.previous_status === 'failed'){
            twiml.say({voice: 'Polly.Amy-Neural'}, "Sorry, I didn't quite get that. Are you able to answer a bit more slowly?")
        }
        if (data.current_question < questions.length) {
            twiml.pause({length:1})
            const question = questions[data.current_question];
            const gather = twiml.gather({
                input:'speech',
                action:`/api/question-response?CallSid=${CallSid}&questionIndex=${data.current_question}`
            })
            gather.say({ voice: 'Polly.Amy-Neural' }, question);
        } else {
            twiml.say({ voice: 'Polly.Amy-Neural' }, 'Thank you very much! Have a great rest of your day.');
        }
    } catch (e) {
        console.error('Error processing the call:', e);
        twiml.say({ voice: 'Polly.Amy' }, 'We encountered an error. Please try again later.');
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
};

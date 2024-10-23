const { createClient } = require("@supabase/supabase-js");

const updateResult = async (supabase, outreach_attempt_id, update) => {
    if (!outreach_attempt_id) {
        throw new Error("outreach_attempt_id is undefined");
    }
    const { error } = await supabase
        .from('outreach_attempt')
        .update(update)
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

const updateCallStatus = async (supabase, callSid, status, timestamp) => {
    const { error } = await supabase
        .from('call')
        .update({ end_time: new Date(timestamp), status })
        .eq('sid', callSid);
    if (error) throw error;
};

const handleVoicemail = async (dbCall, supabase) => {
    await updateResult(supabase, dbCall.outreach_attempt_id, { disposition: 'voicemail', answered_at: new Date() });
};

const handleCallUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition) => {
    await Promise.all([
        updateCallStatus(supabase, callSid, status, timestamp),
        updateResult(supabase, outreach_attempt_id, { disposition })
    ]);
};

const fetchCall = async ({ supabase, callSid }) => {
    const { data: dbCall, error: callError } = await supabase
        .from('call')
        .select('outreach_attempt_id, queue_id')
        .eq('sid', callSid)
        .single();
    if (callError) throw callError;
    if (!dbCall) throw new Error("Call not found");
    return dbCall;
};

const isAnsweringMachine = (answeredBy) => 
    answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other');

const handleQueueUpdate = async (supabase, queueId) => {
    const { error: dequeueError } = await supabase
        .from("campaign_queue")
        .update({ status: "dequeued" })
        .eq("id", queueId);
    if (dequeueError) throw dequeueError;
};

exports.handler = async function (context, event, callback) {
    const supabase = createClient(context.SUPABASE_URL, context.SUPABASE_SERVICE_KEY);
    const { CallSid: callSid, CallStatus: callStatus, Timestamp: timestamp, AnsweredBy: answeredBy } = event;

    try {
        const dbCall = await fetchCall({ supabase, callSid });
        console.log(callStatus)
        switch (callStatus) {
            case 'failed':
            case 'no-answer':
                await handleCallUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, callStatus);
                break;
            case 'completed':
                await handleCallUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, 'completed');
                break;
            case 'initiated':
            case 'in-progress':
                await handleQueueUpdate(supabase, dbCall.queue_id);
                break;
            case 'ringing':
                // Handle ringing status if needed
                break;
            default:
                console.log(`Unhandled call status: ${callStatus}`);
        }

        if (isAnsweringMachine(answeredBy) && callStatus !== 'completed') {
            await handleVoicemail(dbCall, supabase);
        }

        callback(null, { success: true });
    } catch (error) {
        console.error('Error in call handler:', error);
        callback(error);
    }
};
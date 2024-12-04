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

const handleCallUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition, duration) => {
    // First check if there's already a voicemail disposition
    const { data: currentAttempt } = await supabase
        .from('outreach_attempt')
        .select('disposition')
        .eq('id', outreach_attempt_id)
        .single();

    // Only update disposition if it's not already set to voicemail
    if (!currentAttempt?.disposition || currentAttempt.disposition !== 'voicemail') {
        await Promise.all([
            updateCallStatus(supabase, callSid, status, timestamp),
            updateResult(supabase, outreach_attempt_id, { disposition, ended_at: new Date(timestamp), duration })
        ]);
    } else {
        // Just update call status if disposition is voicemail
        await updateCallStatus(supabase, callSid, status, timestamp);
    }
};

const fetchCall = async ({ supabase, callSid }) => {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second delay between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('outreach_attempt_id, queue_id, is_last')
            .eq('sid', callSid)
            .single();

        if (!callError && dbCall) {
            return dbCall;
        }

        if (attempt === maxRetries) {
            throw callError || new Error("Call not found after maximum retries");
        }

        // Wait before next retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
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
    const { CallSid: callSid, CallStatus: callStatus, Timestamp: timestamp, AnsweredBy: answeredBy, Duration: duration } = event;

    try {
        const dbCall = await fetchCall({ supabase, callSid });
        if (dbCall.is_last && callStatus !== 'queued') {
            const { data: campaign, error } = await supabase.from('campaign').update({ status: 'completed' }).eq('id', dbCall.campaign_id).select();
            if (error) throw error;
        } else {
            switch (callStatus) {
                case 'failed':
                case 'no-answer':
                    await handleCallUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, callStatus, duration); 
                    break;
                case 'completed':
                    await handleCallUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, 'completed', duration);
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
        }
    } catch (error) {
        console.error('Error in call handler:', error);
        callback(error);
    }
    };
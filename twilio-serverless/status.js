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
}

const handleCallStatusUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition) => {
    await Promise.all([
        updateCallStatus(supabase, callSid, status, timestamp),
        updateResult(supabase, outreach_attempt_id, { disposition })
    ]);
};

const fetchCall = async ({ supabase, callSid }) => {
    const { data: dbCall, error: callError } = await supabase
        .from('call')
        .select('outreach_attempt_id, queue_id, workspace(id, twilio_data), campaign(*, ivr_campaign(*, script(*)))')
        .eq('sid', callSid)
        .single();
    if (callError) throw callError;
    if (!dbCall) throw new Error("Call not found");
    return dbCall
}

exports.handler = async function (context, event, callback) {
    const supabase = createClient(context.SUPABASE_URL, context.SUPABASE_SERVICE_KEY);
    const callSid = event.CallSid;
    const callStatus = event.CallStatus;
    const timestamp = event.Timestamp;
    try {
        const dbCall = await fetchCall(supabase, callSid)
        if (callStatus === 'failed' || callStatus === 'no-answer') {
            const disposition = callStatus === 'failed' ? 'failed' : 'no-answer';
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, disposition);
        } else if (event.AnsweredBy && event.AnsweredBy.includes('machine') && !event.AnsweredBy.includes('other') && callStatus !== 'completed') {
            await handleVoicemail(dbCall, supabase);
        } else if (callStatus === 'completed') {
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, 'completed');
        } else if (callStatus === "initiatiated" || callStatus === "in-progress") {
            const { error: dequeueError } = await supabase
                .from("campaign_queue")
                .update({ status: "dequeued" })
                .eq("id", dbCall.queue_id);
            if (dequeueError) throw dequeueError;
        }
    } catch (error) {
        console.error(error);
        return callback(error, null)
    }
    return callback(null, { success: true });
};

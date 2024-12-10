const { createClient } = require("@supabase/supabase-js");

const log = (level, message, data = {}) => {
    console[level](`[${new Date().toISOString()}] ${message}`, JSON.stringify(data));
};

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

const updateCallStatus = async (supabase, callSid, status, timestamp, duration) => {
    const { error } = await supabase
        .from('call')
        .update({ end_time: new Date(timestamp), status, duration })
        .eq('sid', callSid);
    if (error) throw error;
};

const handleVoicemail = async (dbCall, supabase) => {
    try {
        // Use upsert-style update to handle race conditions
        const { data: currentAttempt } = await supabase
            .from('outreach_attempt')
            .select('disposition, answered_at')
            .eq('id', dbCall.outreach_attempt_id)
            .single();

        if (!currentAttempt?.disposition) {
            await updateResult(supabase, dbCall.outreach_attempt_id, {
                disposition: 'voicemail',
                answered_at: new Date()
            });
            log('info', 'Set voicemail disposition', { outreach_attempt_id: dbCall.outreach_attempt_id });
        }
    } catch (error) {
        log('error', 'Failed to handle voicemail', { error: error.message, dbCall });
        throw error;
    }
};

const fetchCall = async ({ supabase, callSid }) => {
    const { data: dbCall, error: callError } = await supabase
        .from('call')
        .select('outreach_attempt_id, queue_id, is_last, duration, campaign_id')
        .eq('sid', callSid)
        .single();

    if (callError || !dbCall) {
        throw callError || new Error("Call not found");
    }

    return dbCall;
};

const handleCallUpdate = async (supabase, callSid, status, timestamp, outreach_attempt_id, disposition, duration) => {
    log('info', 'Handling call update', { callSid, status, timestamp, outreach_attempt_id, disposition, duration });
    try {
        const { data: currentAttempt } = await supabase
            .from('outreach_attempt')
            .select('disposition')
            .eq('id', outreach_attempt_id)
            .single();

        await updateCallStatus(supabase, callSid, status, timestamp, duration);

        if ((!currentAttempt?.disposition || currentAttempt.disposition !== 'voicemail') && disposition) {
            await updateResult(supabase, outreach_attempt_id, {
                disposition,
                ended_at: new Date(timestamp)
            });
        }
    } catch (error) {
        log('error', 'Failed to handle call update', {
            error: error.message,
            callSid,
            status
        });
        throw error;
    }
};

const handleQueueUpdate = async (supabase, queueId) => {
    if (!queueId) return;

    try {
        const { error: dequeueError } = await supabase
            .from("campaign_queue")
            .update({ status: "dequeued" })
            .eq("id", queueId);
        if (dequeueError) throw dequeueError;
    } catch (error) {
        log('error', 'Failed to update queue', { error: error.message, queueId });
    }
};

exports.handler = async function (context, event, callback) {
    const startTime = Date.now();
    const supabase = createClient(context.SUPABASE_URL, context.SUPABASE_SERVICE_KEY);
    const {
        CallSid: callSid,
        CallStatus: callStatus,
        RecordingStatus,
        Timestamp: timestamp,
        AnsweredBy: answeredBy,
        Duration: durationIn, 
        CallDuration: callDuration
    } = event;
    let duration = Math.max(Number(callDuration), Number(durationIn));
    console.dir(event, { depth: null });
    try {
        if (RecordingStatus) {
            log('info', 'Recording status update', { callSid, RecordingStatus });
            callback(null, { success: true });
            return;
        }

        log('info', 'Processing call status update', { callSid, callStatus });

        const dbCall = await fetchCall({ supabase, callSid });

        if (answeredBy?.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
            await handleVoicemail(dbCall, supabase);
        }

        switch (callStatus) {
            case 'failed':
            case 'no-answer':
            case 'completed':
                await handleCallUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id, callStatus, duration);
                break;
            case 'initiated':
            case 'in-progress':
                await handleQueueUpdate(supabase, dbCall.queue_id);
                break;
            case 'ringing':
                break;
            default:
                log('warn', 'Unhandled call status', { callStatus });
        }

        if (dbCall.is_last && callStatus !== 'queued') {
            try {
                await supabase
                    .from('campaign')
                    .update({ status: 'complete' })
                    .eq('id', dbCall.campaign_id);
            } catch (error) {
                log('error', 'Failed to complete campaign', {
                    error: error.message,
                    campaign_id: dbCall.campaign_id
                });
            }
        }

        log('info', 'Status update completed', {
            callSid,
            duration: `${Date.now() - startTime}ms`
        });

        callback(null, { success: true });
    } catch (error) {
        log('error', 'Status handler error', {
            error: error.message,
            stack: error.stack,
            duration: `${Date.now() - startTime}ms`
        });
        callback(error);
    }
};
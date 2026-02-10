import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { json } from "@remix-run/node";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

interface CampaignData {
  voicemail_file?: string;
  [key: string]: any;
}

interface CallData {
  campaign_id: string;
  outreach_attempt_id: string;
  workspace: string;
}

interface ParsedBody {
  CallSid: string;
  AnsweredBy?: string;
  CallStatus?: string;
  [key: string]: any;
}

const getCampaignData = async (supabase: any, campaign_id: string): Promise<CampaignData> => {
    const { data: campaign, error } = await supabase
        .from('campaign')
        .select(`*,
            ivr_campaign(*, 
            script(*))`)
        .eq('id', campaign_id)
        .single();
    if (error) throw error;
    return campaign;
};

const updateResult = async (supabase: any, outreach_attempt_id: string, update: any) => {
    const { error } = await supabase
        .from('outreach_attempt')
        .update(update)
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

const handleVoicemail = async (twilio: any, callSid: string, dbCall: CallData, script: CampaignData, supabase: any) => {
    const call = twilio.calls(callSid);
    await updateResult(supabase, dbCall.outreach_attempt_id, { disposition: 'voicemail' });
    const vm = script.voicemail_file;
    if (!vm) {
        await call.update({
            twiml: `<Response><Hangup/></Response>`
        });
    } else {
        const { data, error } = await supabase.storage
            .from(`workspaceAudio`)
            .createSignedUrl(`${dbCall.workspace}/${script.voicemail_file}`, 3600);
        if (error) throw { 'Campaign': error }
        await call.update({
            twiml: `<Response><Pause length="5"/><Play>${data.signedUrl}</Play></Response>`
        });
    }
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
    const formData = await request.formData();

    try {
        const parsedBody: ParsedBody = Object.fromEntries(formData.entries()) as ParsedBody;
        const callSid = parsedBody.CallSid;

        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('campaign_id, outreach_attempt_id, workspace')
            .eq('sid', callSid)
            .single();
        if (callError) throw callError;
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: dbCall.workspace });

        const campaignDetails = await getCampaignData(supabase, dbCall.campaign_id);
        const call = twilio.calls(callSid);

        const updateCallAndAttempt = async (answeredBy: string) => {
            const firstStepUrl = `${env.BASE_URL()}/api/ivr/${dbCall.campaign_id}/1`;
            await call.update({ url: firstStepUrl });

            const updates = [
                supabase
                    .from('call')
                    .upsert({ sid: callSid, answered_by: answeredBy }, { onConflict: 'sid' })
                    .select(),
                supabase
                    .from('outreach_attempt')
                    .update({ answered_at: new Date() })
                    .eq('id', dbCall.outreach_attempt_id)
                    .select()
            ];

            const [callUpdate, attemptUpdate] = await Promise.all(updates);

            if (callUpdate.error) throw callUpdate.error;
            if (attemptUpdate.error) throw attemptUpdate.error;

            return { callUpdate, attemptUpdate };
        };

        const updateOperations = [];

        if (parsedBody.AnsweredBy && parsedBody.AnsweredBy.includes('machine') && !parsedBody.AnsweredBy.includes('other') && parsedBody.CallStatus !== 'completed') {
            updateOperations.push(handleVoicemail(twilio, callSid, dbCall, campaignDetails, supabase));
        } else if (parsedBody.AnsweredBy === 'human' || parsedBody.AnsweredBy === 'unknown') {
            updateOperations.push(updateCallAndAttempt(parsedBody.AnsweredBy));
        } else {
            updateOperations.push(updateCallAndAttempt(parsedBody.AnsweredBy || 'unknown'));
        }

        await Promise.all(updateOperations);
    } catch (error) {
        logger.error("IVR campaign error:", error);
        return json({ success: false, error });
    }
    return json({ success: true });
};

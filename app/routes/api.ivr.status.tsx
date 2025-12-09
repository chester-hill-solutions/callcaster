import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Twilio } from "twilio";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Call, Campaign, IVRCampaign, OutreachAttempt, Script} from "@/lib/types";
import { env } from "@/lib/env.server";

export interface CallEvent {
    Called: string;
    ToState: string;
    CallerCountry: string;
    Direction: string;
    Timestamp: string;
    CallbackSource: string;
    SipResponseCode: string;
    CallerState: string;
    ToZip: string;
    SequenceNumber: string;
    CallSid: string;
    To: string;
    CallerZip: string;
    ToCountry: string;
    CalledZip: string;
    ApiVersion: string;
    CalledCity: string;
    CallStatus: string;
    Duration: string;
    From: string;
    CallDuration: string;
    AccountSid: string;
    CalledCountry: string;
    CallerCity: string;
    ToCity: string;
    FromCountry: string;
    Caller: string;
    FromCity: string;
    CalledState: string;
    FromZip: string;
    AnsweredBy: string;
    FromState: string;
  }

  const updateResult = async (supabase: SupabaseClient, outreach_attempt_id: number | null | undefined, update: Partial<OutreachAttempt>): Promise<void> => {
    if (!outreach_attempt_id) {
        throw new Error("outreach_attempt_id is undefined");
    }
    const { error } = await supabase
        .from('outreach_attempt')
        .update(update)
        .eq('id', outreach_attempt_id);
    if (error) throw error;
};

const updateCallStatus = async (supabase: SupabaseClient, callSid: string, status: string, timestamp: string): Promise<void> => {
    const { error } = await supabase
        .from('call')
        .update({ end_time: new Date(timestamp), status })
        .eq('sid', callSid);
    if (error) throw error;
};

import type { Block } from "@/lib/types";

interface ScriptSteps {
    pages?: Record<string, { title: string; blocks: string[]; speechType?: string; say?: string }>;
    blocks?: Record<string, Block>;
}

function findVoicemailPage(pagesObject: Record<string, { title: string; blocks: string[]; speechType?: string; say?: string }> | undefined): { title: string; blocks: string[]; speechType?: string; say?: string } | null {
    if (!pagesObject) return null;
    for (const pageId in pagesObject) {
        const page = pagesObject[pageId];
        if (page.title.toLowerCase() === "voicemail") {
            return page;
        }
    }
    return null;
}

const handleVoicemail = async (twilio: Twilio.Twilio, callSid: string, dbCall: Call, campaign: Campaign & { ivr_campaign: IVRCampaign & { script: Script } }, supabase: SupabaseClient): Promise<void> => {
    const call = twilio.calls(callSid);
    await updateResult(supabase, dbCall.outreach_attempt_id, { disposition: 'voicemail', answered_at: new Date() });
    const scriptSteps = (campaign.ivr_campaign.script?.steps as unknown) as ScriptSteps | null | undefined;
    const step = findVoicemailPage(scriptSteps?.pages);
    if (!step) {
        await call.update({
            twiml: `<Response><Hangup/></Response>`
        });
    } else {
        if (step.speechType === 'synthetic') {
            await call.update({
                twiml: `<Response><Pause length="1"/><Say>${step.say}</Say></Response>`
            });
        } else {
            if (!campaign.voicemail_file) {
                throw new Error("Voicemail file is undefined");
            }
            const { data, error } = await supabase.storage
                .from(`workspaceAudio`)
                .createSignedUrl(`${dbCall.workspace}/${campaign.voicemail_file}`, 3600);
            if (error) throw { 'Status_Error': error };
            if (!data?.signedUrl) {
                throw new Error("Failed to create signed URL for voicemail file");
            }
            await call.update({
                twiml: `<Response><Pause length="1"/><Play>${data.signedUrl}</Play></Response>`
            });
        }
    }
};

const handleCallStatusUpdate = async (supabase: SupabaseClient, callSid: string, status: string, timestamp: string, outreach_attempt_id: number | null | undefined, disposition: string): Promise<void> => {
    await Promise.all([
        updateCallStatus(supabase, callSid, status, timestamp),
        updateResult(supabase, outreach_attempt_id, { disposition })
    ]);
};

export const action = async ({ request }: { request: Request }) => {
    const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
    const formData = await request.formData();
    
    const parsedBody = Object.fromEntries(formData.entries()) as unknown as CallEvent;
    const callSid = parsedBody.CallSid;
    
    try {
        const { data: dbCall, error: callError } = await supabase
            .from('call')
            .select('outreach_attempt_id, workspace, campaign(*, ivr_campaign(*, script(*)))')
            .eq('sid', callSid)
            .single();
        if (callError) throw callError;
        if (!dbCall) throw new Error("Call not found");

        const twilio = await createWorkspaceTwilioInstance({supabase, workspace_id: dbCall.workspace as string});
        
        const callStatus = parsedBody.CallStatus;
        const timestamp = String(parsedBody.Timestamp || '');

        if (callStatus === 'failed' || callStatus === 'no-answer') {
            const disposition = callStatus === 'failed' ? 'failed' : 'no-answer';
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id as number | null, disposition);
        } else if (parsedBody.AnsweredBy && parsedBody.AnsweredBy.includes('machine') && !parsedBody.AnsweredBy.includes('other') && callStatus !== 'completed') {
            await handleVoicemail(twilio, callSid, dbCall as Call, dbCall.campaign as Campaign & {ivr_campaign: IVRCampaign & {script: Script}}, supabase);
        } else if (callStatus === 'completed'){
            await handleCallStatusUpdate(supabase, callSid, callStatus, timestamp, dbCall.outreach_attempt_id as number | null, 'completed');
        }
    } catch (error) {
        console.error(error);
        return json({ success: false, error });
    }
    return json({ success: true });
};

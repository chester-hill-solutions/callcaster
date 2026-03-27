import Twilio from 'twilio';
import { createSupabaseServerClient, verifyAuth } from '../../lib/supabase.server';
import { createWorkspaceTwilioInstance, parseActionRequest, requireWorkspaceAccess } from "../../lib/database.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import type { TablesInsert, Database } from "@/lib/database.types";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";

interface DialRequest {
  to_number: string;
  user_id: string;
  campaign_id: string;
  contact_id: string;
  workspace_id: string;
  queue_id: string;
  outreach_id?: string;
  caller_id: string;
  selected_device?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { supabaseClient: supabase } = createSupabaseServerClient(request);
    const raw = await parseActionRequest(request) as Partial<DialRequest>;
    const {
        to_number,
        user_id,
        campaign_id,
        contact_id,
        workspace_id,
        queue_id,
        outreach_id,
        caller_id,
        selected_device,
    } = raw;
    if (
        typeof to_number !== "string" ||
        typeof user_id !== "string" ||
        typeof campaign_id !== "string" ||
        typeof contact_id !== "string" ||
        typeof workspace_id !== "string" ||
        typeof queue_id !== "string" ||
        typeof caller_id !== "string"
    ) {
        throw new Response("Invalid dial payload", { status: 400 });
    }
    const { user } = await verifyAuth(request);
    if (!user) throw new Response("Unauthorized", { status: 401 });
    await requireWorkspaceAccess({ supabaseClient: supabase, user, workspaceId: workspace_id });

    const { data, error } = await supabase.from('workspace').select('credits').eq('id', workspace_id).single();
    if (error) throw error;
    const credits = data.credits;
    if (credits <= 0) {
        return {
            creditsError: true,
        }
    }
    const [{ data: callerIdRecord }, onboarding] = await Promise.all([
        supabase
            .from("workspace_number")
            .select("type, phone_number")
            .eq("workspace", workspace_id)
            .eq("phone_number", caller_id)
            .maybeSingle(),
        getWorkspaceMessagingOnboardingState({
            supabaseClient: supabase,
            workspaceId: workspace_id,
        }),
    ]);
    if (onboarding.selectedChannels?.includes("voice_compliance") && onboarding.emergencyVoice.enabled) {
        if (!callerIdRecord) {
            throw new Response("Caller ID must be a workspace number for emergency-compliant voice.", { status: 400 });
        }
        if (!onboarding.emergencyVoice.allowedCallerIdTypes.includes(callerIdRecord.type ?? "")) {
            throw new Response("Selected caller ID is not eligible for emergency-compliant voice.", { status: 400 });
        }
        if (
            callerIdRecord.phone_number &&
            !onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.includes(callerIdRecord.phone_number)
        ) {
            throw new Response("Selected caller ID is not marked as emergency-ready.", { status: 400 });
        }
    }
    const to = normalizePhoneNumber(to_number)
    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id });
    const twiml = new Twilio.twiml.VoiceResponse();
    try {
        const call = await twilio.calls.create({
            to: selected_device && selected_device !== 'computer' ? selected_device : `client:${user_id}`,
            from: caller_id,
            url: `${env.BASE_URL()}/api/dial/${encodeURIComponent(to)}`,

        })
        let outreach_attempt_id;
        const campaignId = parseInt(campaign_id, 10);
        const contactId = parseInt(contact_id, 10);
        const queueId = parseInt(queue_id, 10);
        if (!outreach_id) {
            const { data: outreachAttempt, error: outreachError } = await supabase.rpc('create_outreach_attempt',
                {
                    con_id: contactId,
                    cam_id: campaignId,
                    queue_id: queueId,
                    wks_id: workspace_id,
                    usr_id: user_id
                });
            if (outreachError) throw outreachError;
            outreach_attempt_id = typeof outreachAttempt === "number" ? outreachAttempt : Number(outreachAttempt);
        } else {
            outreach_attempt_id = Number(outreach_id)
        }
        
        const callData: TablesInsert<"call"> = {
            sid: call.sid,
            date_updated: call.dateUpdated?.toISOString() ?? new Date().toISOString(),
            parent_call_sid: call.parentCallSid ?? null,
            account_sid: call.accountSid ?? null,
            to: to_number,
            from: call.from ?? null,
            phone_number_sid: call.phoneNumberSid ?? null,
            status: (call.status ?? null) as Database["public"]["Enums"]["call_status"] | null,
            start_time: call.startTime?.toISOString() ?? null,
            end_time: call.endTime?.toISOString() ?? null,
            duration: call.duration != null ? String(call.duration) : null,
            price: call.price ?? null,
            direction: call.direction ?? null,
            answered_by: (call.answeredBy ?? null) as Database["public"]["Enums"]["answered_by"] | null,
            api_version: call.apiVersion ?? null,
            forwarded_from: call.forwardedFrom ?? null,
            group_sid: call.groupSid ?? null,
            caller_name: call.callerName ?? null,
            uri: call.uri ?? null,
            campaign_id: campaignId,
            contact_id: contactId,
            workspace: workspace_id,
            outreach_attempt_id: Number.isFinite(outreach_attempt_id) ? outreach_attempt_id : null,
            queue_id: queueId,
        };
        const { error } = await supabase.from('call').upsert(callData);
        if (error) logger.error('Error saving the call to the database:', error);
    } catch (error) {
        logger.error('Error placing call:', error);
        twiml.say('There was an error placing your call. Please try again later.');
    }

    return new Response(twiml.toString(), {
        headers: {
            'Content-Type': 'text/xml'
        }
    });
}

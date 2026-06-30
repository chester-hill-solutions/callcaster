import { createWorkspaceTwilioInstance, parseActionRequest, requireWorkspaceAccess } from "@/lib/database.server";
import { saveCallToDatabase } from "@/lib/auto-dial.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { createTenantDb } from "@/server/tenant-db";
import { and, eq } from "drizzle-orm";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { env } from "@/lib/env.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { normalizePhoneNumber } from "@/lib/utils";
import Twilio from 'twilio';
import type { ActionFunctionArgs } from "react-router";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

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
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;

    const supabase = getAuthSupabaseClient(auth);
    const user = auth.user;
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
    await requireWorkspaceAccess({ supabaseClient: supabase, user, workspaceId: workspace_id });

    const credits = await getWorkspaceCreditsBalance(workspace_id);
    if (credits === null) {
        throw new Response("Workspace not found", { status: 404 });
    }
    if (credits <= 0) {
        return {
            creditsError: true,
        }
    }
    const tdb = createTenantDb(workspace_id);
    const [callerIdRecord, onboarding] = await Promise.all([
        tdb.workspace_number.findFirst({
            where: eq(workspaceNumberTable.phone_number, caller_id),
        }),
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
    const twilio = await createWorkspaceTwilioInstance({ supabase: supabase, workspace_id });
    const twiml = new Twilio.twiml.VoiceResponse();
    try {
        const call = await withTwilioRetry(
          () =>
            twilio.calls.create({
              to:
                selected_device && selected_device !== "computer"
                  ? selected_device
                  : `client:${user_id}`,
              from: caller_id,
              url: `${env.BASE_URL()}/api/dial/${encodeURIComponent(to)}`,
            }),
          { workspaceId: workspace_id, operation: "calls.create" },
        );
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
        
        await saveCallToDatabase(workspace_id, {
            sid: call.sid,
            date_updated: call.dateUpdated?.toISOString() ?? new Date().toISOString(),
            parent_call_sid: call.parentCallSid ?? null,
            account_sid: call.accountSid ?? null,
            to: to_number,
            from: call.from ?? null,
            phone_number_sid: call.phoneNumberSid ?? null,
            status: call.status ?? null,
            start_time: call.startTime?.toISOString() ?? null,
            end_time: call.endTime?.toISOString() ?? null,
            duration: call.duration != null ? String(call.duration) : null,
            price: call.price ?? null,
            direction: call.direction ?? null,
            answered_by: call.answeredBy ?? null,
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
        });
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

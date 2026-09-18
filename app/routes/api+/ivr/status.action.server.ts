import { Call, Campaign, OutreachAttempt } from "@/lib/types";
import { fetchCampaignWithScript } from "@/lib/campaign-ivr.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import {
  hangupTwiml,
  pausePlayTwiml,
} from "@/lib/twilio-twiml.server";
import {
  buildCallUpsertFromTwilioParams,
  processCallStatusWebhook,
} from "@/lib/twilio-call-status.server";
import { findCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import { defineAction } from "@/lib/handler.server";
import type Twilio from "twilio";
import { parseTwilioVoiceCallback } from "@/lib/twilio/voice-callback";

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

  const updateResult = async (workspaceId: string, outreach_attempt_id: number | null | undefined, update: Partial<OutreachAttempt>): Promise<void> => {
    if (!outreach_attempt_id) {
        throw new Error("outreach_attempt_id is undefined");
    }
    const result = await updateOutreachAttemptForWorkspace(workspaceId, outreach_attempt_id, update);
    if (result instanceof Response) {
        throw new Error("Failed to update outreach attempt");
    }
};

const handleVoicemail = async (twilio: Twilio.Twilio, callSid: string, dbCall: Call, campaign: Campaign): Promise<void> => {
    const call = twilio.calls(callSid);
    // Test calls (#1653) have a campaign but no outreach attempt; the voicemail
    // drop must still play for them.
    if (dbCall.outreach_attempt_id) {
        await updateResult(String(dbCall.workspace), dbCall.outreach_attempt_id, { disposition: 'voicemail', answered_at: new Date().toISOString() });
    }
    // #1839: an explicit toggle gates the drop, and the audio is the campaign's
    // dedicated voicemail file. A script page titled "voicemail" no longer
    // triggers anything.
    if (!campaign.voicemail_drop_enabled || !campaign.voicemail_file) {
        await call.update({ twiml: hangupTwiml() });
        return;
    }
    const signedUrl = await createSignedObjectUrl(
        "workspaceAudio",
        `${dbCall.workspace}/${campaign.voicemail_file}`,
        3600,
    );
    await call.update({ twiml: pausePlayTwiml(signedUrl) });
};

export const action = defineAction({
    auth: async ({ request }) => {
        const formData = await request.clone().formData();
        const params = Object.fromEntries(formData.entries()) as Record<string, string>;
        // Parsed once here (#1243 E2) instead of each field being re-narrowed
        // with `typeof x === "string"` below.
        const event = parseTwilioVoiceCallback(params);
        const callSid = event.callSid;
        if (!callSid) {
            // Preserve the original order: the handler throws "Missing CallSid"
            // (caught into `{ success: false }`) before any signature check.
            return { params, event, callSid };
        }
        const forbidden = await requireTwilioSignature(request, { callSid });
        return forbidden ?? { params, event, callSid };
    },
    sideEffects: ["db-write", "credit", "twilio", "external"],
    handler: async ({ auth }) => {
    const { params, event, callSid } = auth;

    try {
        if (!callSid) {
            throw new Error("Missing CallSid");
        }

        const dbCall = await findCallBySid(callSid);
        if (!dbCall) throw new Error("Call not found");
        if (!dbCall.workspace) throw new Error("Call missing workspace");
        if (dbCall.campaign_id == null) throw new Error("Call missing campaign_id");
        const campaignData = await fetchCampaignWithScript(dbCall.campaign_id);

        const twilio = await createWorkspaceTwilioInstance({ workspace_id: dbCall.workspace });

        const callStatus = event.callStatus;
        const answeredBy = event.answeredBy ?? "";
        const isMachine =
            Boolean(answeredBy) &&
            answeredBy.includes('machine') &&
            !answeredBy.includes('other') &&
            callStatus !== 'completed';

        if (isMachine) {
            await handleVoicemail(twilio, callSid, dbCall, campaignData);
        } else if (['failed', 'no-answer', 'completed'].includes(callStatus)) {
            const updateData = buildCallUpsertFromTwilioParams(params);
            await processCallStatusWebhook(updateData, {
                campaignType: campaignData.type ?? null,
                workspaceId: String(dbCall.workspace),
                campaignId: dbCall.campaign_id ?? null,
                contactId: dbCall.contact_id ?? null,
                outreachAttemptId: dbCall.outreach_attempt_id ?? null,
                userId: dbCall.user_id ?? null,
                note: `IVR Call ${callSid}, Campaign ${campaignData.title ?? "unknown"}`,
            });
            // `processCallStatusWebhook` only persists the `call` row, so without
            // this the attempt keeps a NULL disposition and `get_campaign_stats`
            // filters the call out of campaign results entirely. Twilio's
            // terminal statuses are already valid disposition values; a machine
            // answer that later reports `completed` keeps its `voicemail`
            // disposition via the terminal-transition guard in
            // `updateOutreachAttemptForWorkspace`.
            if (dbCall.outreach_attempt_id) {
                await updateResult(String(dbCall.workspace), dbCall.outreach_attempt_id, {
                    disposition: callStatus,
                });
            }
        }
    } catch (error) {
        logger.error("Error processing IVR status:", error);
        return routeData({ success: false, error });
    }
    return routeData({ success: true });
    },
});

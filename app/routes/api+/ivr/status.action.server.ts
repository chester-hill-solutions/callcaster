import { Call, Campaign, OutreachAttempt, Script, type Block } from "@/lib/types";
import { resolveCampaignScript, fetchCampaignWithScript } from "@/lib/campaign-ivr.server";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { voiceCreditsFromDurationSeconds, debitAmountFromCredits } from "@/lib/pricing";
import { callKey } from "@/lib/billing-keys";
import {
  hangupTwiml,
  pausePlayTwiml,
  pauseSayTwiml,
} from "@/lib/twilio-twiml.server";
import {
  persistCallStatusFromParams,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";
import { findCallBySid, updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import type Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

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

interface ScriptSteps {
    pages?: Record<string, { title: string; blocks: string[]; speechType?: string; say?: string }>;
    blocks?: Record<string, Block>;
}

function findVoicemailPage(pagesObject: Record<string, { title: string; blocks: string[]; speechType?: string; say?: string }> | undefined): { title: string; blocks: string[]; speechType?: string; say?: string } | null {
    if (!pagesObject) return null;
    for (const pageId in pagesObject) {
        const page = pagesObject[pageId];
        if (!page) {
            continue;
        }
        if (page.title.toLowerCase() === "voicemail") {
            return page;
        }
    }
    return null;
}

const handleVoicemail = async (twilio: Twilio.Twilio, callSid: string, dbCall: Call, campaign: Campaign & { script: Script | Script[] | null }): Promise<void> => {
    const call = twilio.calls(callSid);
    await updateResult(String(dbCall.workspace), dbCall.outreach_attempt_id, { disposition: 'voicemail', answered_at: new Date().toISOString() });
    const scriptSteps = (resolveCampaignScript(campaign)?.steps as unknown) as ScriptSteps | null | undefined;
    const step = findVoicemailPage(scriptSteps?.pages);
    if (!step) {
        await call.update({ twiml: hangupTwiml() });
    } else {
        if (step.speechType === 'synthetic') {
            await call.update({ twiml: pauseSayTwiml(step.say ?? "") });
        } else {
            if (!campaign.voicemail_file) {
                throw new Error("Voicemail file is undefined");
            }
            const signedUrl = await createSignedObjectUrl(
                "workspaceAudio",
                `${dbCall.workspace}/${campaign.voicemail_file}`,
                3600,
            );
            await call.update({ twiml: pausePlayTwiml(signedUrl) });
        }
    }
};

const debitIvrCallCredits = async (
        args: {
        callSid: string;
        workspaceId: string;
        campaignName: string;
        durationSeconds: number;
    },
): Promise<void> => {
    const credits = voiceCreditsFromDurationSeconds(args.durationSeconds, "ivr");
    await insertTransactionHistoryIdempotent({
        workspaceId: args.workspaceId,
        type: "DEBIT",
        amount: debitAmountFromCredits(credits),
        note: `IVR Call ${args.callSid}, Campaign ${args.campaignName}, Duration ${args.durationSeconds}s`,
        idempotencyKey: callKey(args.callSid, "ivr"),
        callSid: args.callSid,
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const underCase = twilioParamsToUnderCase(params);
    const callSid = typeof underCase.call_sid === "string" ? underCase.call_sid : null;

    try {
        if (!callSid) {
            throw new Error("Missing CallSid");
        }
        const validation = await validateTwilioWebhookForCallSid({
            request,
            callSid,
            params,
        });
        if (!validation.ok) {
            return validation.response;
        }

        const dbCall = await findCallBySid(callSid);
        if (!dbCall) throw new Error("Call not found");
        if (!dbCall.workspace) throw new Error("Call missing workspace");
        const campaignData = await fetchCampaignWithScript(dbCall.campaign_id);

        const twilio = await createWorkspaceTwilioInstance({ workspace_id: dbCall.workspace });

        const callStatus = typeof underCase.call_status === "string" ? underCase.call_status : "";
        const timestamp = typeof underCase.timestamp === "string" ? underCase.timestamp : '';

        const answeredBy = typeof underCase.answered_by === "string" ? underCase.answered_by : "";
        const isMachine =
            Boolean(answeredBy) &&
            answeredBy.includes('machine') &&
            !answeredBy.includes('other') &&
            callStatus !== 'completed';

        if (isMachine) {
            await handleVoicemail(
                twilio,
                callSid,
                dbCall as unknown as Call,
                campaignData as unknown as Campaign & { script: Script | Script[] | null },
            );
        } else {
            switch (callStatus) {
                case 'failed': {
                    await persistCallStatusFromParams({
                        params,
                        disposition: 'failed',
                        outreachAttemptId: dbCall.outreach_attempt_id ?? null,
                    });
                    break;
                }
                case 'no-answer': {
                    await persistCallStatusFromParams({
                        params,
                        disposition: 'no-answer',
                        outreachAttemptId: dbCall.outreach_attempt_id ?? null,
                    });
                    break;
                }
                case 'completed': {
                    await persistCallStatusFromParams({
                        params,
                        disposition: 'completed',
                        outreachAttemptId: dbCall.outreach_attempt_id ?? null,
                    });
                    const durationSeconds = Math.max(
                        Number(underCase.call_duration) || 0,
                        Number(underCase.duration) || 0,
                    );
                    await debitIvrCallCredits({
                        callSid,
                        workspaceId: String(dbCall.workspace),
                        campaignName: campaignData.title ?? "unknown",
                        durationSeconds,
                    });
                    break;
                }
                default:
                    break;
            }
        }
    } catch (error) {
        logger.error("Error processing IVR status:", error);
        return routeData({ success: false, error });
    }
    return routeData({ success: true });
};

import { predictiveMachineResponse } from "@/lib/predictive-machine.server";
import { Call } from "@/lib/types";
import { Tables } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { logger } from "@/lib/logger.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import {
  findCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { createVoiceResponse, hangupTwiml } from "@/lib/twilio-twiml.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import { isMachineAnswered } from "@/lib/ivr-machine.server";

function resolveUserIdFromConferenceName(conferenceName: string): string {
    // Conference names are generated as `${userId}~${uuid}`. The user id is a UUID,
    // so we split on the non-hex separator to recover the original user id.
    const sep = conferenceName.indexOf('~');
    if (sep === -1) return conferenceName;
    return conferenceName.slice(0, sep);
}

const fetchCallData = async (callSid: string): Promise<NonNullable<Partial<Call>>> => {
  const row = await findCallBySid(callSid);
  if (!row) {
    throw new Error(`Error fetching call data: call ${callSid} not found`);
  }
  return row;
};

const fetchCampaignData = async (campaignId: string, workspaceId: string) => {
  const row = await fetchCampaignByIdForWorkspace(workspaceId, campaignId);
  return {
    voicemail_drop_enabled: row.voicemail_drop_enabled,
    voicemail_file: row.voicemail_file,
    group_household_queue: row.group_household_queue,
    caller_id: row.caller_id,
  };
};

const updateOutreachAttempt = async (
  attemptId: string,
  workspaceId: string,
  update: Partial<Tables<"outreach_attempt">>,
) => {
  const result = await updateOutreachAttemptForWorkspace(workspaceId, attemptId, update);
  if (result instanceof Response) {
    throw new Error(`Error updating outreach attempt: ${await result.text()}`);
  }
  return [result];
};

const triggerAutoDialer = async (conferenceId: string, campaignId: string, workspaceId: string, userId: string) => {
    // Call the dialer turn in-process rather than self-fetching
    // `/api/auto-dial/dialer`: that path is matched by the Twilio webhook
    // prefix `/api/auto-dial`, so an unsigned self-fetch would be rejected
    // with 403 by requireTwilioSignature (always enforced in production).
    await runAutoDialerTurn({
        user_id: userId,
        campaign_id: campaignId,
        workspace_id: workspaceId,
        conference_id: conferenceId,
    });
};

const handleHumanAnswer = async (dbCall: NonNullable<Partial<Call>>, called: string) => {
    const twiml = createVoiceResponse();
    const conferenceName = dbCall.conference_id?.toString() ?? '';

    if (dbCall.outreach_attempt_id && !called.startsWith('client')) {
        await updateOutreachAttempt(
          String(dbCall.outreach_attempt_id),
          dbCall.workspace?.toString() ?? "",
          { answered_at: new Date().toISOString() },
        );
    }

    // A statusCallback here — mirroring the agent's own leg in
    // addToConference — is what lets a CLIENT hangup be detected at all.
    // Without it, Twilio never posts a participant-leave event for this
    // leg, so the app has no server-driven signal and depends entirely on
    // Twilio's platform-level endConferenceOnExit reaching the agent's
    // browser. handleParticipantLeave (auto-dial/status) already forces the
    // conference closed on `participant_hung_up` for whichever leg posts
    // it — it just never received the contact's events before.
    const dial = twiml.dial();
    dial.conference({
        beep: 'onExit',
        endConferenceOnExit: true,
        statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
    }, `${conferenceName}`);

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleDeviceCheck = async (dbCall: NonNullable<Partial<Call>>) => {
    const conferenceId = dbCall.conference_id?.toString() ?? '';
    const userId = resolveUserIdFromConferenceName(conferenceId);
    return await addToConference(conferenceId, dbCall.campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '', userId);
};

async function addToConference(conferenceId: string, campaignId: string, workspaceId: string, userId: string) {
    const twiml = createVoiceResponse();
    const workspace = await getWorkspaceById(workspaceId);
    appendLiveTranscriptionStreamTwiml({
        twiml,
        featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
        params: {
            workspaceId,
            userId,
            direction: "predictive",
            campaignId,
            streamName: `conf-${conferenceId}`,
        },
    });
    const dial = twiml.dial();
    dial.conference({
        beep: 'false',
        statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
        statusCallbackEvent: ['join', 'leave', 'modify'],
        endConferenceOnExit: false,
    }, conferenceId);
    await triggerAutoDialer(conferenceId, campaignId, workspaceId, userId);
    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
}

const checkUserDevices = async (contactId: string, conferenceName: string, called: string, callerId: string) => {
    const userId = resolveUserIdFromConferenceName(conferenceName);
    const verifiedNumbers = await getUserVerifiedAudioNumbers(userId);
    if (!verifiedNumbers?.length) return false;
    if (called.includes('client')) return true;
    if (called === callerId) return true;
    if (!contactId && verifiedNumbers.includes(called)) return true;
    return false;
}

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const callSid = formData.get("CallSid") as string;
    const forbidden = await requireTwilioSignature(request, { callSid });
    return forbidden ?? null;
  },
  sideEffects: ["db-write", "twilio", "external"],
  handler: async ({ request, params }) => {
    const conferenceName = params.roomId as string;
    const formData = await request.clone().formData();
    const callSid = formData.get("CallSid") as string;
    const answeredBy = formData.get("AnsweredBy") as string;
    const callStatus = formData.get("CallStatus") as string;
    const called = (formData.get("Called") ?? "").toString();

    let response: Response;

    try {
      const dbCall = await fetchCallData(callSid);
      const machinePhase = new URL(request.url).searchParams.get("machine");
      const binding = {
        workspaceId: dbCall.workspace?.toString() ?? "",
        callSid,
        conferenceId: conferenceName,
      };
      if (machinePhase)
        return await predictiveMachineResponse(
          binding,
          machinePhase,
          new URL(request.url).searchParams.get("operation"),
        );
      const campaign = await fetchCampaignData(
        dbCall.campaign_id?.toString() ?? "",
        dbCall.workspace?.toString() ?? "",
      );

      if (
        await checkUserDevices(
          dbCall.contact_id?.toString() ?? "",
          conferenceName,
          called,
          campaign.caller_id?.toString() ?? "",
        )
      ) {
        return await handleDeviceCheck(dbCall);
      } else {
        //This is a non-client device (outbound call)
        if (isMachineAnswered(answeredBy, callStatus)) {
          response = await predictiveMachineResponse(binding);
        } else {
          //This is a human answer
          response = await handleHumanAnswer(dbCall, called);
        }
      }
    } catch (error) {
      logger.error("General error:", error);
      response = new Response(hangupTwiml(), {
        status: 500,
        headers: { "Content-Type": "text/xml" },
      });
    }

    return response;
  },
});

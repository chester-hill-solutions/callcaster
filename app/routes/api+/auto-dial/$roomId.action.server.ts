import { Call } from "@/lib/types";
import { CallInstance, CallContext } from 'twilio/lib/rest/api/v2010/account/call';
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { Database, Tables } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { runAutoDialerTurn } from "@/lib/auto-dial.server";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { createTenantDb } from "@/server/tenant-db";
import { logger } from "@/lib/logger.server";
import { dequeueCampaignQueueByContact } from "@/lib/campaign-queue-db.server";
import { fetchCampaignByIdForWorkspace } from "@/lib/campaign-ivr.server";
import { getUserVerifiedAudioNumbers } from "@/lib/user-audio.server";
import {
  findCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { hangupTwiml, pausePlayTwiml } from "@/lib/twilio-twiml.server";
import { createSignedObjectUrl } from "@/lib/object-storage.server";
import Twilio from "twilio";

const getAdmin = () => null /* removed service client */;

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
    voicemail_file: row.voicemail_file,
    group_household_queue: row.group_household_queue,
    caller_id: row.caller_id,
  };
};

const getVoicemailSignedUrl = async (workspace: string, voicemailFile: string) => {
    if (!voicemailFile) return null;
    try {
      return await createSignedObjectUrl("workspaceAudio", `${workspace}/${voicemailFile}`, 3600);
    } catch (error) {
      throw new Error(`Error fetching voicemail file: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const dequeueContact = async (
  contactId: string,
  groupOnHousehold: boolean,
  userId: string,
  workspace: string,
  campaignId?: number | null,
) => {
    if (groupOnHousehold) {
        const tdb = createTenantDb(workspace);
        return await rpcDequeueContact(tdb, {
            contactId: Number(contactId),
            groupOnHousehold,
            dequeuedById: userId,
            dequeuedReasonText: "Auto-dial completed",
        });
    }

    try {
        return await dequeueCampaignQueueByContact({
          contactId: Number(contactId),
          campaignId,
          userId,
          reason: "Auto-dial completed",
        });
    } catch (error) {
        throw new Error(
          `Error updating queue status: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
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

type OutreachStatusItem = {
  user_id: string | number | null;
  campaign_id: string | number | null;
};

const handleMachineAnswer = async (
    call: CallContext,
    twilio: Twilio.Twilio,
    dbCall: NonNullable<Partial<Call>>,
    campaign: NonNullable<Partial<Tables<"campaign">>>,
    signedUrl: string,
    outreachStatus: OutreachStatusItem[]
) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const firstOutreachStatus = outreachStatus[0];
    if (!firstOutreachStatus) {
        await call.update({ twiml: hangupTwiml() });
        return new Response(twiml.toString(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    await dequeueContact(
      dbCall.contact_id?.toString() ?? "",
      campaign.group_household_queue ?? false,
      firstOutreachStatus.user_id?.toString() ?? "",
      dbCall.workspace?.toString() ?? "",
      dbCall.campaign_id ?? null,
    );

    const conferenceName = dbCall.conference_id?.toString() ?? '';
    const conferences = await twilio.conferences.list({ friendlyName: conferenceName, status: 'in-progress' });
    if (conferences.length) {
        await triggerAutoDialer(conferenceName, firstOutreachStatus.campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '', firstOutreachStatus.user_id?.toString() ?? '');
    }

    await call.update({ twiml: pausePlayTwiml(signedUrl, 5) });

    return new Response(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' }
    });
};

const handleHumanAnswer = async (dbCall: NonNullable<Partial<Call>>, called: string) => {
    const twiml = new Twilio.twiml.VoiceResponse();
    const conferenceName = dbCall.conference_id?.toString() ?? '';

    if (dbCall.outreach_attempt_id && !called.startsWith('client')) {
        await updateOutreachAttempt(
          String(dbCall.outreach_attempt_id),
          dbCall.workspace?.toString() ?? "",
          { answered_at: new Date().toISOString() },
        );
    }

    const dial = twiml.dial();
    dial.conference({
        beep: 'onExit',
        endConferenceOnExit: true,
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
    const twiml = new Twilio.twiml.VoiceResponse();
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

export const action = async ({ request, params }: { request: Request, params: { roomId: string } }) => {
    const conferenceName = params.roomId;
    const formData = await request.clone().formData();
    const parsedBody = Object.fromEntries(formData) as Record<string, string>;
    const callSid = formData.get('CallSid') as string;
    const answeredBy = formData.get('AnsweredBy') as string;
    const callStatus = formData.get('CallStatus') as string;
    const called = (formData.get('Called') ?? "").toString();

    let response: Response;

    try {
        const forbidden = await requireTwilioSignature(request, { callSid });
        if (forbidden) return forbidden;
        const dbCall = await fetchCallData(callSid);
        const campaign = await fetchCampaignData(dbCall.campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '');

        if (await checkUserDevices(dbCall.contact_id?.toString() ?? '', conferenceName, called, campaign.caller_id?.toString() ?? '')) {
            return await handleDeviceCheck(dbCall);
        } else {
            //This is a non-client device (outbound call)
            const twilio = await createWorkspaceTwilioInstance({ workspace_id: dbCall.workspace ?? '' });
            const call: CallContext = twilio.calls(callSid);

            if (answeredBy && answeredBy.includes('machine') && !answeredBy.includes('other') && callStatus !== 'completed') {
                //This is an answering machine
                const campaign = await fetchCampaignData(dbCall.campaign_id?.toString() ?? '', dbCall.workspace?.toString() ?? '');
                const signedUrl = await getVoicemailSignedUrl(dbCall.workspace?.toString() ?? '', campaign.voicemail_file?.toString() ?? '');
                const outreachStatus = await updateOutreachAttempt(
                  dbCall.outreach_attempt_id?.toString() ?? "",
                  dbCall.workspace?.toString() ?? "",
                  { disposition: "voicemail" },
                );
                if (signedUrl) {
                    response = await handleMachineAnswer(call, twilio, dbCall, campaign, signedUrl, outreachStatus);
                } else {
                    //No voicemail file found, so we hang up
                    response = new Response(hangupTwiml(), {
                        headers: { 'Content-Type': 'text/xml' }
                    });
                }
            } else {
                //This is a human answer
                response = await handleHumanAnswer(dbCall, called);
            }
        }
    } catch (error) {
        logger.error('General error:', error);
        response = new Response(hangupTwiml(), {
            headers: { 'Content-Type': 'text/xml' }
        });
    }

    return response;
};

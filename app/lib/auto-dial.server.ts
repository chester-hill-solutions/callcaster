import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber as sharedNormalizePhoneNumber } from "@/lib/utils";
import type { Call } from '@/lib/types';
import type TwilioSDK from "twilio";
import { call as callTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";
import {
  rpcCreateOutreachAttempt,
  rpcDequeueContact,
} from "@/lib/db-rpc.server";
import { claimNextQueueContact, requeueCampaignQueueById } from "@/lib/campaign-queue-db.server";
import { updateCallBySid } from "@/lib/telephony-db.server";
import { recipientCallingWindowStatus } from "@/lib/recipient-calling-window";
import { db } from "@/server/db";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";

type TwilioClient = TwilioSDK.Twilio;

export const normalizePhoneNumber = sharedNormalizePhoneNumber;

export async function getNextAutoDialQueueContact(
  campaign_id: number,
  user_id: string,
  tdb: TenantDb = createTenantDb("service"),
) {
  return claimNextQueueContact(tdb, campaign_id, user_id);
}

export async function createOutreachAttempt(
  contactRecord: { queue_id: number, contact_id: number, contact_phone: string }, 
  campaign_id: number,
  workspace_id: string,
  user_id: string,
) {
  return rpcCreateOutreachAttempt(db, {
    contactId: contactRecord.contact_id,
    campaignId: campaign_id,
    userId: user_id,
    workspaceId: workspace_id,
    queueId: contactRecord.queue_id,
  });
}

export async function createTwilioCall(
  client: TwilioClient,
  toNumber: string,
  fromNumber: string,
  conference_id: string,
  selected_device: string,
) {
  return await client.calls.create({
    to: toNumber,
    from: fromNumber,
    url: `${env.BASE_URL()}/api/auto-dial/${conference_id}`,
    machineDetection: "Enable",
    statusCallbackEvent: ["answered", "completed", "ringing"],
    statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
  });
}

function buildCallRow(callData: Partial<Call>) {
  return {
    sid: callData.sid!,
    account_sid: callData.account_sid || null,
    to: callData.to || null,
    from: callData.from || null,
    status: callData.status || null,
    start_time: callData.start_time ? new Date(callData.start_time).toISOString() : null,
    end_time: callData.end_time ? new Date(callData.end_time).toISOString() : null,
    duration: callData.duration ? String(callData.duration) : null,
    price: callData.price ? String(callData.price) : null,
    direction: callData.direction || null,
    answered_by: callData.answered_by || null,
    api_version: callData.api_version || null,
    forwarded_from: callData.forwarded_from || null,
    group_sid: callData.group_sid || null,
    caller_name: callData.caller_name || null,
    uri: callData.uri || null,
    user_id: callData.user_id || null,
    campaign_id: callData.campaign_id || null,
    contact_id: callData.contact_id || null,
    outreach_attempt_id: callData.outreach_attempt_id || null,
    conference_id: callData.conference_id || null,
    phone_number_sid: callData.phone_number_sid || null,
    parent_call_sid: callData.parent_call_sid || null,
    date_updated: callData.date_updated
      ? new Date(callData.date_updated).toISOString()
      : null,
  };
}

export async function saveCallToDatabase(
  workspaceId: string,
  callData: Partial<Call>,
  options?: { tdb?: TenantDb },
) {
  if (!callData.sid) {
    logger.error("Cannot save call without sid");
    return;
  }

  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const row = buildCallRow(callData);

  try {
    const existing = await tdb.call.findFirst({
      where: eq(callTable.sid, callData.sid),
    });
    if (existing) {
      // A status callback can land before this post-create write; route the
      // update through the guarded helper so a terminal status is never
      // regressed to the create-response status (e.g. `queued`).
      await updateCallBySid(
        workspaceId,
        callData.sid,
        row as Parameters<typeof updateCallBySid>[2],
        { tdb },
      );
      return;
    }
    await tdb.call.insert({
      ...row,
      date_created: new Date().toISOString(),
      is_last: false,
    });
  } catch (error) {
    logger.error("Error saving the call to the database:", error);
  }
}

export async function completeAllConferences(client: TwilioClient, conferenceId: string) {
  const isSid = conferenceId.startsWith("CF");
  if (isSid) {
    try {
      await client.conferences(conferenceId).update({ status: "completed" as const });
    } catch (error) {
      logger.error(`Error completing conference ${conferenceId}:`, error);
    }
    return;
  }

  const conferences = await client.conferences.list({
    friendlyName: conferenceId,
    status: "in-progress" as const,
  });
  await Promise.all(
    conferences.map(({ sid }) =>
      client.conferences(sid).update({ status: "completed" as const }),
    ),
  );
}

export type AutoDialerTurnInput = {
  user_id: string;
  campaign_id: number | string;
  workspace_id: string;
  selected_device?: string;
  conference_id?: string | null;
};

export type AutoDialerTurnResult =
  | { success: true; message?: string }
  | { success: false; error: string };

/**
 * Advances the predictive dialer by one turn: claims the next queued contact
 * for the campaign and places a call, or completes the conference if the
 * queue is empty.
 *
 * Callers that need to trigger the next dialer turn invoke this in-process
 * rather than issuing an HTTP self-fetch under `/api/auto-dial` — that path
 * matches the Twilio webhook prefix, so an unsigned self-fetch is rejected
 * with 403 by `requireTwilioSignature` whenever signature validation is
 * enabled (always in production). The old public `/api/auto-dial/dialer`
 * route was deleted in the SEC-02 hardening; the authenticated entry point is
 * the workspace campaign `dialer/start` action. See server/twilio-webhook.ts.
 */
export async function runAutoDialerTurn(
  input: AutoDialerTurnInput,
): Promise<AutoDialerTurnResult> {
  const { user_id, workspace_id, selected_device } = input;
  const campaign_id = Number(input.campaign_id);
  const conferenceId =
    typeof input.conference_id === "string" && input.conference_id
      ? input.conference_id
      : user_id;

  const twilioClient = await createWorkspaceTwilioInstance({ workspace_id });
  const tdb = createTenantDb(workspace_id);

  try {
    // Claim the next contact that is inside the recipient-local calling
    // window (TCPA/CRTC 8am–9pm recipient time). Out-of-window claims are
    // released back to `queued` so a later turn can dial them; seeing an
    // already-released row again means every claimable contact is currently
    // out of window, so the turn ends instead of spinning.
    const MAX_WINDOW_SKIPS_PER_TURN = 25;
    const releasedQueueIds = new Set<number>();
    let contactRecord = await getNextAutoDialQueueContact(campaign_id, user_id, tdb);
    while (contactRecord) {
      const windowStatus = recipientCallingWindowStatus(
        contactRecord.contact_phone,
      );
      if (windowStatus.allowed) break;
      logger.info("auto_dial.recipient_window_skip", {
        campaignId: campaign_id,
        queueId: contactRecord.queue_id,
        timezone: windowStatus.timezone,
        reason: windowStatus.reason,
      });
      const alreadyReleased = releasedQueueIds.has(contactRecord.queue_id);
      releasedQueueIds.add(contactRecord.queue_id);
      await requeueCampaignQueueById(contactRecord.queue_id, workspace_id);
      if (alreadyReleased || releasedQueueIds.size >= MAX_WINDOW_SKIPS_PER_TURN) {
        contactRecord = null;
        break;
      }
      contactRecord = await getNextAutoDialQueueContact(campaign_id, user_id, tdb);
    }

    if (contactRecord) {
      logger.debug("Contact record:", contactRecord);

      // Everything up through placing the Twilio call can fail without any
      // call having actually been placed. If it does, release the claimed
      // queue row back to `queued` — otherwise `claim_next_queue_contact`
      // has already marked it assigned and it is stuck forever, wedging the
      // predictive dialer's queue for that contact.
      let toNumber: string;
      let outreach_attempt_id: number;
      try {
        toNumber = normalizePhoneNumber(contactRecord.contact_phone);
        outreach_attempt_id = await createOutreachAttempt(
          contactRecord,
          campaign_id,
          workspace_id,
          user_id,
        );
      } catch (prepError) {
        try {
          await requeueCampaignQueueById(contactRecord.queue_id, workspace_id);
        } catch (revertError) {
          logger.error(
            "Failed to release claimed queue contact after auto-dial failure:",
            revertError,
          );
        }
        throw prepError;
      }

      // `calls.create` failures split two ways. A Twilio REST error (has a
      // numeric HTTP `status`) means Twilio rejected the request and no call
      // exists — requeue so a later turn can retry. Anything else (network
      // failure, timeout) is AMBIGUOUS: the call may be live and untracked.
      // Requeueing an ambiguous attempt makes the next dialer turn redial a
      // contact who may already be on the phone, so park the entry by
      // dequeueing it with an explicit reason for manual/open-sync review.
      let call: Awaited<ReturnType<typeof createTwilioCall>>;
      try {
        call = await createTwilioCall(
          twilioClient,
          toNumber,
          contactRecord.caller_id,
          conferenceId,
          selected_device ?? "",
        );
      } catch (dialError) {
        const restStatus = (dialError as { status?: unknown }).status;
        const callDefinitelyNotCreated =
          typeof restStatus === "number" && restStatus >= 400;
        try {
          if (callDefinitelyNotCreated) {
            await requeueCampaignQueueById(contactRecord.queue_id, workspace_id);
          } else {
            logger.error("auto_dial.ambiguous_dial_parked", {
              campaignId: campaign_id,
              queueId: contactRecord.queue_id,
              contactId: contactRecord.contact_id,
              outreachAttemptId: outreach_attempt_id,
            });
            await rpcDequeueContact(tdb, {
              contactId: contactRecord.contact_id,
              groupOnHousehold: false,
              dequeuedById: user_id,
              dequeuedReasonText:
                "Ambiguous dial failure — call may exist at Twilio; parked for review, not redialed",
            });
          }
        } catch (revertError) {
          logger.error(
            "Failed to release claimed queue contact after auto-dial failure:",
            revertError,
          );
        }
        throw dialError;
      }

      await rpcDequeueContact(tdb, {
        contactId: contactRecord.contact_id,
        groupOnHousehold: true,
        dequeuedById: user_id,
        dequeuedReasonText: "Predictive Dialer called contact",
      });

      // `call.dateUpdated`/`startTime`/`endTime` are `Date` in the Twilio SDK's
      // `CallInstance` type, while `Call.date_updated`/`start_time`/`end_time`
      // are `text()` (string) columns — convert them here so `callData` is a
      // real `Partial<Call>` the compiler checks, instead of force-casting a
      // mismatched shape past it. The `? … : null` guards are defensive: Twilio's
      // docs note these fields come back empty for a call that hasn't
      // started/ended yet, despite the SDK typing them as always-present.
      const callData: Partial<Call> = {
        sid: call.sid,
        date_updated: call.dateUpdated ? call.dateUpdated.toISOString() : null,
        parent_call_sid: call.parentCallSid,
        account_sid: call.accountSid,
        to: toNumber,
        from: call.from,
        phone_number_sid: call.phoneNumberSid,
        status: call.status,
        start_time: call.startTime ? call.startTime.toISOString() : null,
        end_time: call.endTime ? call.endTime.toISOString() : null,
        duration: call.duration,
        price: call.price,
        direction: call.direction,
        answered_by: call.answeredBy,
        api_version: call.apiVersion,
        forwarded_from: call.forwardedFrom,
        group_sid: call.groupSid,
        caller_name: call.callerName,
        uri: call.uri,
        campaign_id,
        contact_id: contactRecord.contact_id,
        workspace: workspace_id,
        outreach_attempt_id,
        conference_id: conferenceId,
      };

      await saveCallToDatabase(workspace_id, callData);
      return { success: true };
    }

    await completeAllConferences(twilioClient, conferenceId);
    return {
      success: true,
      message:
        releasedQueueIds.size > 0
          ? "No contacts within recipient calling hours"
          : "No queued contacts",
    };
  } catch (error) {
    logger.error("Error dialing number:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

import {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  normalizePhoneNumber,
  saveCallToDatabase,
} from "@/lib/auto-dial.server";
import { createWorkspaceTwilioInstance, safeParseJson } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { Call } from "@/lib/types";
import { rpcDequeueContact } from "@/lib/db-rpc.server";
import { db } from "@/server/db";
import type { Database } from "@/lib/db-types";

export {
  completeAllConferences,
  createOutreachAttempt,
  createTwilioCall,
  getNextAutoDialQueueContact,
  getNextAutoDialQueueContact as getNextContact,
  normalizePhoneNumber,
  saveCallToDatabase,
} from "@/lib/auto-dial.server";

export const action = async ({ request }: { request: Request }) => {
  const client = createClient<Database>(
    env.BASE_URL(),
    env.BASE_URL(),
  );
  const body = await safeParseJson<{
    user_id: string;
    campaign_id: number;
    workspace_id: string;
    selected_device: string;
  }>(request);
  const { user_id, campaign_id, workspace_id, selected_device } = body;
  const twilioClient = await createWorkspaceTwilioInstance({ workspace_id,
  });
  const realtime = adminDb.channel(user_id);

  try {
    const contactRecord = await getNextAutoDialQueueContact(
      campaign_id,
      user_id,
    );
    if (contactRecord) {
      logger.debug("Contact record:", contactRecord);
      const toNumber = normalizePhoneNumber(contactRecord.contact_phone);

      const outreach_attempt_id = await createOutreachAttempt(
        contactRecord,
        campaign_id,
        workspace_id,
        user_id,
      );

      const call = await createTwilioCall(
        twilioClient,
        toNumber,
        contactRecord.caller_id,
        user_id,
        selected_device,
      );

      await rpcDequeueContact(db, {
        contactId: contactRecord.contact_id,
        groupOnHousehold: true,
        dequeuedById: user_id,
        dequeuedReasonText: "Predictive Dialer called contact",
      });
      realtime.send({
        type: "broadcast",
        event: "message",
        payload: { contact_id: contactRecord.contact_id, status: "dialing" },
      });

      const callData = {
        sid: call.sid,
        date_updated: call.dateUpdated,
        parent_call_sid: call.parentCallSid,
        account_sid: call.accountSid,
        to: toNumber,
        from: call.from,
        phone_number_sid: call.phoneNumberSid,
        status: call.status,
        start_time: call.startTime,
        end_time: call.endTime,
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
        conference_id: user_id,
      };

      await saveCallToDatabase(workspace_id, callData as unknown as Partial<Call>);
      adminDb.removeChannel(realtime);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await completeAllConferences(twilioClient, user_id);

    return new Response(
      JSON.stringify({ success: true, message: "No queued contacts" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logger.error("Error dialing number:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
    });
  }
};

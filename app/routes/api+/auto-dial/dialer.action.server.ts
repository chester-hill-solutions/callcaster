import { createClient } from "@supabase/supabase-js";
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
import type { Database } from "@/lib/database.types";

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
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const body = await safeParseJson<{
    user_id: string;
    campaign_id: number;
    workspace_id: string;
    selected_device: string;
  }>(request);
  const { user_id, campaign_id, workspace_id, selected_device } = body;
  const twilioClient = await createWorkspaceTwilioInstance({ supabase: supabase,
    workspace_id,
  });
  const realtime = supabase.channel(user_id);

  try {
    const contactRecord = await getNextAutoDialQueueContact(
      supabase,
      campaign_id,
      user_id,
    );
    if (contactRecord) {
      logger.debug("Contact record:", contactRecord);
      const toNumber = normalizePhoneNumber(contactRecord.contact_phone);

      const outreach_attempt_id = await createOutreachAttempt(
        supabase,
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

      const { error } = await supabase.rpc("dequeue_contact", {
        passed_contact_id: contactRecord.contact_id,
        group_on_household: true,
        dequeued_by_id: user_id,
        dequeued_reason_text: "Predictive Dialer called contact",
      });
      if (error) {
        logger.error("Error dequeing contact", error);
        throw error;
      }
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

      await saveCallToDatabase(supabase, callData as unknown as Partial<Call>);
      supabase.removeChannel(realtime);
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

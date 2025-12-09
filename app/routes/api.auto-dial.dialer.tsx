import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import Twilio from "twilio";
import { env } from "../lib/env.server";
import { logger } from "../lib/logger.server";
import type { Database } from "../lib/database.types";
import type { Call } from "../lib/types";

type TwilioClient = Awaited<ReturnType<typeof createWorkspaceTwilioInstance>>;

function normalizePhoneNumber(input:string) {
  let cleaned = input.replace(/[^0-9+]/g, "");
  if (cleaned.indexOf("+") > 0) {
    cleaned = cleaned.replace(/\+/g, "");
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  const validLength = 11;
  const minLength = 11;
  if (cleaned.length < minLength + 1) {
    cleaned = "+1" + cleaned.replace("+", "");
  }
  if (cleaned.length !== validLength + 1) {
    throw new Error("Invalid phone number length");
  }
  return cleaned;
}

async function getNextContact(supabase: SupabaseClient, campaign_id: number, user_id: string) {
  const { data: record, error } = await supabase.rpc("auto_dial_queue", {
    campaign_id_variable: campaign_id,
    user_id_variable: user_id,
  });
  if (error) throw error;
  return record.length > 0 ? record[0] : null;
}

async function createOutreachAttempt(
  supabase: SupabaseClient,
  contactRecord: { queue_id: number, contact_id: number, contact_phone: string }, 
  campaign_id: number,
  workspace_id: string,
  user_id: string,
) {
  const { data: outreachAttempt, error } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: contactRecord.contact_id,
      cam_id: campaign_id,
      queue_id: contactRecord.queue_id,
      wks_id: workspace_id,
      usr_id: user_id,
    },
  );
  if (error) throw error;
  return outreachAttempt;
}

async function createTwilioCall(client: TwilioClient, toNumber: string, fromNumber: string, user_id: string, selected_device: string) {
  return await client.calls.create({
    to: toNumber,
    from: fromNumber,
    url: `${env.BASE_URL()}/api/auto-dial/${user_id}`,
    machineDetection: "Enable",
    statusCallbackEvent: ["answered", "completed", "ringing"],
    statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
  });
}

async function saveCallToDatabase(
  supabase: SupabaseClient<Database>,
  callData: Partial<Call>
) {
  if (!callData.sid) {
    logger.error("Cannot save call without sid");
    return;
  }
  
  const insertData: Database['public']['Tables']['call']['Insert'] = {
    sid: callData.sid,
    account_sid: callData.account_sid || null,
    to: callData.to || null,
    from: callData.from || null,
    status: (callData.status as Database['public']['Enums']['call_status']) || null,
    start_time: callData.start_time ? new Date(callData.start_time).toISOString() : null,
    end_time: callData.end_time ? new Date(callData.end_time).toISOString() : null,
    duration: callData.duration ? String(callData.duration) : null,
    price: callData.price ? String(callData.price) : null,
    direction: callData.direction || null,
    answered_by: (callData.answered_by as Database['public']['Enums']['answered_by']) || null,
    api_version: callData.api_version || null,
    forwarded_from: callData.forwarded_from || null,
    group_sid: callData.group_sid || null,
    caller_name: callData.caller_name || null,
    uri: callData.uri || null,
    campaign_id: callData.campaign_id || null,
    contact_id: callData.contact_id || null,
    workspace: callData.workspace || null,
    outreach_attempt_id: callData.outreach_attempt_id || null,
    conference_id: callData.conference_id || null,
    phone_number_sid: callData.phone_number_sid || null,
    parent_call_sid: callData.parent_call_sid || null,
  };
  
  const { error } = await supabase
    .from("call")
    .upsert(insertData)
    .select();
  if (error) logger.error("Error saving the call to the database:", error);
}

async function completeAllConferences(client: TwilioClient, user_id: string) {
  const conferences = await client.conferences.list({
    friendlyName: user_id,
    status: "in-progress" as const,
  });
  await Promise.all(
    conferences.map(({ sid }) =>
      client.conferences(sid).update({ status: "completed" as const }),
    ),
  );
}

export const action = async ({ request }: { request: Request }) => {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const body = await request.json() as {
    user_id: string;
    campaign_id: number;
    workspace_id: string;
    selected_device: string;
  };
  const { user_id, campaign_id, workspace_id, selected_device } = body;
  const twilioClient = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id,
  });
  const realtime = supabase.channel(user_id);

  try {
    const contactRecord = await getNextContact(supabase, campaign_id, user_id);
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
        dequeued_reason_text: "Predictive Dialer called contact"
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
    } else {
      await completeAllConferences(twilioClient, user_id);

      return new Response(
        JSON.stringify({ success: true, message: "No queued contacts" }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    logger.error("Error dialing number:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

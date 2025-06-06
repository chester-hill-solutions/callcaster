import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Twilio } from "twilio";

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

async function createTwilioCall(twilio: Twilio, toNumber: string, fromNumber: string, user_id: string, selected_device: string) {
  return await twilio.calls.create({
    to: toNumber,
    from: fromNumber,
    url: `${process.env.BASE_URL}/api/auto-dial/${user_id}`,
    machineDetection: "Enable",
    statusCallbackEvent: ["answered", "completed", "ringing"],
    statusCallback: `${process.env.BASE_URL}/api/auto-dial/status`,
  });
}

async function saveCallToDatabase(supabase: SupabaseClient, callData: any) {
  Object.keys(callData).forEach(
    (key) => callData[key] === undefined && delete callData[key],
  );
  const { error } = await supabase
    .from("call")
    .upsert({ ...callData })
    .select();
  if (error) console.error("Error saving the call to the database:", error);
}

async function completeAllConferences(twilio: Twilio, user_id: string) {
  const conferences = await twilio.conferences.list({
    friendlyName: user_id,
    status: ["in-progress"],
  });
  await Promise.all(
    conferences.map(({ sid }) =>
      twilio.conferences(sid).update({ status: "completed" }),
    ),
  );
}

export const action = async ({ request }: { request: Request }) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const { user_id, campaign_id, workspace_id, selected_device } = await request.json();
  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id,
  });
  const realtime = supabase.channel(user_id);

  try {
    const contactRecord = await getNextContact(supabase, campaign_id, user_id);
    if (contactRecord) {
      console.log(contactRecord);
      const toNumber = normalizePhoneNumber(contactRecord.contact_phone);

      const outreach_attempt_id = await createOutreachAttempt(
        supabase,
        contactRecord,
        campaign_id,
        workspace_id,
        user_id,
      );

      const call = await createTwilioCall(
        twilio,
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
        console.error("Error dequeing contact", error);
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

      await saveCallToDatabase(supabase, callData);
      supabase.removeChannel(realtime);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      await completeAllConferences(twilio, user_id);

      return new Response(
        JSON.stringify({ success: true, message: "No queued contacts" }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error: any) {
    console.error("Error dialing number:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

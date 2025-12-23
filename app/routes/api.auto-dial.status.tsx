import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { json } from "@remix-run/react";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Tables } from "@/lib/database.types";
import { OutreachAttempt } from "@/lib/types";
import { Twilio } from "twilio";
import type { ActionFunctionArgs } from "@remix-run/node";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const updateCall = async (sid: string, update: Partial<Tables<"call">>) => {
  try {
    const { data, error } = await supabase
      .from("call")
      .update(update)
      .eq("sid", sid)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating call:", error);
    throw error;
  }
};

const updateOutreachAttempt = async (
  id: string,
  update: Partial<OutreachAttempt>,
) => {
  try {
    const { data, error } = await supabase
      .from("outreach_attempt")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error: unknown) {
    console.error("Error updating outreach attempt:", error);
    return new Response(
      `Error updating outreach attempt: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
};

const updateCampaignQueue = async (
  contactId: string,
  update: Partial<Tables<"campaign_queue">>,
) => {
  try {
    const { data, error } = await supabase
      .from("campaign_queue")
      .update(update)
      .eq("contact_id", contactId)
      .select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating campaign queue:", error);
    throw error;
  }
};

const triggerAutoDialer = async (callData: Tables<"call">) => {
  try {
    const response = await fetch(
      `${process.env.BASE_URL}/api/auto-dial/dialer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: callData.conference_id,
          campaign_id: callData.campaign_id,
          workspace_id: callData.workspace,
          conference_id: callData.conference_id,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error triggering auto dialer:", error);
    throw error;
  }
};

const handleCallStatus = async (
  parsedBody: { [x: string]: string },
  dbCall: Tables<"call">,
  twilio: Twilio,
  realtime: RealtimeChannel,
  status: Tables<"call">["status"],
  duration: number
) => {
  try {
    const callUpdate = await updateCall(parsedBody.CallSid, {
      end_time: new Date(parsedBody.Timestamp).toISOString(),
      status: status?.toLowerCase() as Tables<"call">["status"],
      duration: duration.toString()
    });
    const outreachStatus = await updateOutreachAttempt(
      callUpdate.outreach_attempt_id,
      { disposition: status?.toLowerCase() as Tables<"outreach_attempt">["disposition"] },
    );
    await updateTransaction(callUpdate, duration);

    const { error } = await supabase.rpc("dequeue_contact", {
      passed_contact_id: outreachStatus.contact_id,
      group_on_household: true,
      dequeued_by_id: callUpdate.conference_id,
      dequeued_reason_text: `Call ${status?.toLowerCase()}`
    });
    if (error) {
      console.error("Error dequeing contact", error);
      throw error;
    }
    realtime.send({
      type: "broadcast",
      event: "message",
      payload: { contact_id: outreachStatus.contact_id, status },
    });
    const conferences = await twilio.conferences.list({
      friendlyName: callUpdate.conference_id,
      status: "in-progress",
    });
    if (conferences.length && status !== "completed") {
      await triggerAutoDialer(dbCall);
    }
  } catch (error) {
    console.error("Error in handleCallStatus:", error);
    throw error;
  }
};

const onePerSixty = (duration: number) => {
  return Math.floor(duration / 60) + 1;
}
const updateTransaction = async (call: Tables<"call">, duration: number) => {
  const billingUnits = onePerSixty(duration);
  const { data: transaction, error: transactionError } = await supabase.from('transaction_history').insert({
    workspace: call.workspace,
    type: "DEBIT",
    amount: -billingUnits,
    note: `Call ${call.sid}, Contact ${call.contact_id}, Outreach Attempt ${call.outreach_attempt_id}`
  }).select();
  if (transactionError) {
    console.error("Error creating transaction:", transactionError);
    throw transactionError;
  }
  return transaction;
}

const handleParticipantLeave = async (
  parsedBody: { [x: string]: string },
  twilio: Twilio,
  realtime: RealtimeChannel,
) => {

  try {
    const dbCall = await updateCall(parsedBody.CallSid, {
      end_time: new Date(parsedBody.Timestamp).toISOString(),
      duration: Math.max(Number(parsedBody.Duration), Number(parsedBody.CallDuration)).toString(),
      status: parsedBody?.CallStatus?.toLowerCase() as Tables<"call">["status"]
    });
    const { data: outreachStatus, error: outreachError } = await supabase
      .from('outreach_attempt')
      .select('*')
      .eq('id', dbCall.outreach_attempt_id)
      .single();
    if (outreachError) {
      console.error("Error fetching outreach status", outreachError);
      throw outreachError;
    }

    realtime.send({
      type: "broadcast",
      event: "message",
      payload: {
        contact_id: outreachStatus.contact_id,
        status: "completed",
      },
    });
    const conferences = await twilio.conferences.list({
      friendlyName: parsedBody.FriendlyName,
      status: "in-progress",
    });
    await Promise.all(
      conferences.map(({ sid }) =>
        twilio.conferences(sid).update({ status: "completed" }),
      ),
    );
  } catch (error) {
    console.error("Error in handleParticipantLeave:", error);
    throw error;
  }
};

const handleParticipantJoin = async (
  parsedBody: { [x: string]: string },
  dbCall: Tables<"call">,
  realtime: RealtimeChannel,
) => {
  try {
    if (!dbCall.conference_id) {
      await updateCall(parsedBody.CallSid, {
        conference_id: parsedBody.ConferenceSid,
        start_time: new Date(parsedBody.Timestamp).toISOString(),
      });
    }
    if (dbCall.outreach_attempt_id) {
      const outreachStatus = await updateOutreachAttempt(
        `${dbCall.outreach_attempt_id}`,
        { disposition: "in-progress", answered_at: new Date().toISOString() },
      );
      await updateCampaignQueue(outreachStatus.contact_id, {
        status: parsedBody.FriendlyName,
      });

      realtime.send({
        type: "broadcast",
        event: "message",
        payload: {
          contact_id: outreachStatus.contact_id,
          status: "connected",
        },
      });
    }
  } catch (error) {
    console.error("Error in handleParticipantJoin:", error);
    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {

  let realtime;
  try {
    const formData = await request.formData();
    const parsedBody = Object.fromEntries(formData) as { [x: string]: string };

    const { data: dbCall, error: callError } = await supabase
      .from("call")
      .select()
      .eq("sid", parsedBody.CallSid)
      .single();
    if (callError) {
      throw new Error("Failed to fetch call data: " + callError.message);
    }

    const twilio = await createWorkspaceTwilioInstance({
      supabase,
      workspace_id: dbCall.workspace,
    });
    realtime = supabase.channel(parsedBody.ConferenceSid);
    switch (parsedBody.CallStatus) {
      case "failed":
      case "busy":
      case "no-answer":
      case "completed":
        await handleCallStatus(
          parsedBody,
          dbCall,
          twilio,
          realtime,
          parsedBody.CallStatus?.toLowerCase() as Tables<"call">["status"],
          Math.max(Number(parsedBody.CallDuration), Number(parsedBody.Duration))
        );
        break;
      default:
        if (
          parsedBody.StatusCallbackEvent === "participant-leave" &&
          parsedBody.ReasonParticipantLeft === "participant_hung_up"
        ) {
          await handleParticipantLeave(parsedBody, twilio, realtime);
        } else if (parsedBody.StatusCallbackEvent === "participant-join") {
          await handleParticipantJoin(parsedBody, dbCall, realtime);
        }
    }

    return json({ success: true });
  } catch (error: unknown) {
    console.error("Error processing action:", error);
    return json(
      { error: "Failed to process action: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  } finally {
    if (realtime) {
      supabase.removeChannel(realtime);
    }
  }
};

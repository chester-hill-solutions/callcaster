import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
};

export async function createWorkspaceTwilioInstance(
  supabase: SupabaseClient,
  workspace_id: string,
) {
  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace_id)
    .single();
  if (error) throw error;
  const twilio = new Twilio.Twilio(
    data.twilio_data.sid,
    data.twilio_data.authToken,
  );
  return twilio;
}

const handleTriggerStart = async (
  contacts: any[],
  campaign_id: string,
  user_id: string,
) => {
  for (let i = 0; i < contacts?.length; i++) {
    const contact = contacts[i];
    const formData = new FormData();
    formData.append("to_number", contact.phone);
    formData.append("user_id", user_id);
    formData.append("campaign_id", campaign_id);
    formData.append("workspace_id", contact.workspace);
    formData.append("queue_id", contact.id);
    formData.append("contact_id", contact.contact_id);
    formData.append("caller_id", contact.caller_id);
    await fetch(`${Deno.env.get("SITE_URL")}/api/ivr`, {
      body: formData,
      method: "POST",
    }).catch((e) => console.log(e));
  }
};

async function getWorkspaceUsers(
  supabaseClient: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabaseClient.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  return { data, error };
}

const getWorkspaceOwner = async (
  supabase: SupabaseClient,
  workspace_id: string,
) => {
  const { data, error } = await getWorkspaceUsers(supabase, workspace_id);
  if (error) throw error;
  return data.find((contact) => contact.user_workspace_role === "owner");
};

const handleInitiateCampaign = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase.rpc("get_campaign_queue", {
    campaign_id_pro: id,
  });
  if (error) throw error;
  const owner = await getWorkspaceOwner(supabase, data[0].workspace);
  await handleTriggerStart(data, id, owner.id);
};

async function cancelCallAndUpdateDB(twilio, supabase, call) {
  try {
    const canceledCall = await twilio
      .calls(call.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_outreach_attempts", {
      in_call_sid: canceledCall.sid,
    });
    return canceledCall.sid;
  } catch (error) {
    throw new Error(`Error canceling call ${call.sid}: ${error.message}`);
  }
}

async function cancelMessageAndUpdateDB(twilio, supabase, message) {
  try {
    const cancelledMessage = await twilio
      .messages(message.sid)
      .update({ status: "canceled" });
    await supabase.rpc("cancel_messages", {
      message_ids: cancelledMessage.sid,
    });
    return cancelledMessage.sid;
  } catch (error) {
    throw new Error(`Error canceling call ${message.sid}: ${error.message}`);
  }
}

const fetchQueuedCalls = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("call")
    .select(
      `
    sid,
    outreach_attempt!inner(
      id,
      disposition,
      contact_id
    )
  `,
    )
    .eq("outreach_attempt.disposition", null)
    .eq("campaign_id", id);
  if (error) throw error;
  return data;
};

async function fetchQueuedTwilioMessages(twilio) {
  return await twilio.messages.list({
    status: "queued",
  });
}

async function fetchDatabaseMessages(
  supabase: SupabaseClient,
  campaign_id: string,
) {
  const { data, error } = await supabase
    .from("message")
    .select("sid, campaign_id")
    .eq("campaign_id", campaign_id);
  if (error) throw error;
  return data;
}

async function fetchQueuedMessagesForCampaign(
  supabase: SupabaseClient,
  twilio,
  campaign_id: string,
) {
  const [dbMessages, twilioMessages] = await Promise.all([
    fetchDatabaseMessages(supabase, campaign_id),
    fetchQueuedTwilioMessages(twilio),
  ]);

  const campaignMessageSids = new Set(dbMessages.map((msg) => msg.sid));

  return twilioMessages.filter((msg) => campaignMessageSids.has(msg.sid));
}

const handleBatch = async (
  supabase: SupabaseClient,
  twilio,
  type: "live_call" | "message" | "robocall",
  campaign_id: string,
) => {
  const cancelled = [];
  const errors = [];
  if (type === "live_call") return;
  if (type === "robocall") {
    const calls = await fetchQueuedCalls(supabase, campaign_id);
    for (let i = 0; i < calls.length; i++) {
      const call = calls[0];
      try {
        const sid = await cancelCallAndUpdateDB(twilio, supabase, call);
        cancelled.push(sid);
      } catch (error) {
        console.error(error);
        errors.push(call);
      }
    }
  }
  if (type === "message") {
    const messages = await fetchQueuedMessagesForCampaign(
      supabase,
      twilio,
      campaign_id,
    );
    for (let i = 0; i < messages.length; i++) {
      const message = messages[0];
      try {
        const sid = await cancelMessageAndUpdateDB(twilio, supabase, message);
        cancelled.push(sid);
      } catch (error) {
        console.error(error);
        errors.push(message);
      }
    }
  }
  return { cancelled, errors };
};

const handlePauseCampaign = async (supabase: SupabaseClient, id: string) => {
  const { data, error } = await supabase
    .from("campaign")
    .select("type, workspace")
    .eq("id", id)
    .single();
  if (error) throw error;
  const twilio = await createWorkspaceTwilioInstance(supabase, data.workspace);
  try {
    handleBatch(supabase, twilio, data.type, id);
  } catch (error) {
    console.error(error);
    throw error;
  }
};

Deno.serve(async (req) => {
  const { record } = await req.json();
  const supabase = initSupabaseClient();
  const now = new Date();
  try {
    if (record.is_active && record.end_date > now && record.start_date < now) {
      handleInitiateCampaign(supabase, record.id);
    } else if (!record.is_active) {
      handlePauseCampaign(supabase, record.id);
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, details: error.details }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

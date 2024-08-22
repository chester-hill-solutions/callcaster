import { json } from "@remix-run/react";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Tables } from "~/lib/database.types";
import { OutreachAttempt } from "~/lib/types";

export const action = async ({ request }) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  const { workspaceId: workspace_id } = await request.json();
  const twilio = await createWorkspaceTwilioInstance({
    supabase: supabaseClient,
    workspace_id,
  });

  const updateOutreachAttempt = async (
    id: string,
    update: Partial<OutreachAttempt>,
  ) => {
    try {
      const { data, error } = await supabaseClient
        .from("outreach_attempt")
        .update(update)
        .eq("id", id)
        .select();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error updating outreach attempt:", error);
      throw error;
    }
  };


  try {
    const conferences = await twilio.conferences.list({
      friendlyName: serverSession.user.id,
      status: ["in-progress"],
    });

    await Promise.all(
      conferences.map(async (conf) => {
        try {
          await twilio.conferences(conf.sid).update({ status: "completed" });

          const { data, error } = await supabaseClient
            .from("call")
            .select("sid")
            .eq("conference_id", conf.sid);
          if (error) throw error;
            console.log(data)
          await Promise.all(
            data.map(async (call) => {
              try {
                
                if (call.outreach_attempt_id) {
                  const update = await updateOutreachAttempt(
                    call.outreach_attempt_id,
                    { disposition: "completed" },
                  );
                  const { data:queue, error } = await supabaseClient.rpc('dequeue_contact', { passed_contact_id: update[0].contact_id, group_on_household: true });
                  await twilio
                  .calls(call.sid)
                  .update({ twiml: `<Response><Hangup/></Response>` });
                  console.log(queue, error)
                }
              } catch (callError) {
                console.error(`Error updating call ${call.sid}:`, callError);
              }
            }),
          );
        } catch (confError) {
          console.error(`Error updating conference ${conf.sid}:`, confError);
        }
      }),
    );
  } catch (e) {
    console.error("Error listing or updating conferences:", e);
    return json({ error: e.message }, { status: 500 });
  }

  return json({ success: true });
};

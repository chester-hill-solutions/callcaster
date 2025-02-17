import { json } from "@remix-run/react";
import { verifyAuth } from "../lib/supabase.server";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Call, OutreachAttempt } from "~/lib/types";
import { ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabaseClient, headers, user } =
    await verifyAuth(request);
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
      if (!update) throw new Error("Update is required");
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
      friendlyName: user.id,
      status: ["in-progress"],
    });

    await Promise.all(
      conferences.map(async (conf) => {
        try {
          await twilio.conferences(conf.sid).update({ status: "completed" });

          const { data, error } = await supabaseClient
            .from("call")
            .select("sid, outreach_attempt_id")
            .eq("conference_id", conf.sid);
          if (error) throw error;
          if (!data || !data.length) return;
          await Promise.all(
            data.map(async (call: Partial<Call>) => {
              if (!call || !call.sid || !call.outreach_attempt_id) return;
              try {

                if (call.outreach_attempt_id) {
                  const update = await updateOutreachAttempt(
                    call.outreach_attempt_id.toString(),
                    { disposition: "completed" },
                  );
                  const { data: queue, error } = await supabaseClient.rpc('dequeue_contact', { passed_contact_id: update[0].contact_id, group_on_household: true });
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
  } catch (e: any) {
    console.error("Error listing or updating conferences:", e);
    return json({ error: e.message }, { status: 500 });
  }

  return json({ success: true });
};

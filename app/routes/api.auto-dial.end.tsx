import { json } from "@remix-run/react";
import { verifyAuth } from "../lib/supabase.server";
import { createWorkspaceTwilioInstance } from "../lib/database.server";
import { Call, OutreachAttempt } from "~/lib/types";
import { ActionFunctionArgs, data } from "@remix-run/node";

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
  ): Promise<{ outreach_attempt: OutreachAttempt & { campaign_queue: { campaign: { group_household_queue: boolean } } } }> => {
    try {
      if (!update) throw new Error("Update is required");
      const { data: outreachData, error } = await supabaseClient
        .from("outreach_attempt")
        .update(update)
        .eq("id", Number(id))
        .select('*, campaign_queue!inner(campaign!inner(group_household_queue))')
        .single();
      if (error) throw error;
      
      // Transform the data to match the expected return type
      const outreachStatus = {
        outreach_attempt: {
          ...outreachData,
          campaign_queue: outreachData.campaign_queue[0]
        }
      };

      return outreachStatus;
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
                  const { data: queue, error } = await supabaseClient.rpc('dequeue_contact', {
                    passed_contact_id: update.outreach_attempt.contact_id,
                    group_on_household: update.outreach_attempt.campaign_queue.campaign.group_household_queue,
                    dequeued_by_id: user.id,
                    dequeued_reason_text: "Call ended by user"
                  });
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

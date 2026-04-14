import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import { getFunctionUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { getFunctionHeaders } from "../_shared/getFunctionHeaders.ts";


export async function handleRequest(req: Request): Promise<Response> {
  try {
    const { campaign_id, owner } = await req.json()
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await supabase.rpc("get_campaign_queue", {
      campaign_id_pro: campaign_id,
    });
    if (error || !data) throw error || "No queue found";
    if (!data.length) {
      console.log(`Queue is now empty. Marking completed.`)
      const { error: campaignUpdateError } = await supabase
        .from("campaign")
        .update({ status: "complete" })
        .eq("id", campaign_id);
      if (campaignUpdateError) throw campaignUpdateError
      return new Response(
        JSON.stringify({ status: "queue_empty" }),
        { headers: { "Content-Type": "application/json" } },
      )
    }
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select("is_active, group_household_queue, type, sms_send_mode, sms_messaging_service_sid, caller_id")
      .eq("id", campaign_id)
      .single();
    if (campaignError) throw campaignError;
    if (!campaign.is_active) {
      return new Response(
        JSON.stringify({ status: "campaign_completed" }),
        { headers: { "Content-Type": "application/json" } },
      )
    }
    const contact = data[0];
    if (campaign.type === "message") {  
      console.log(`Sending message to contact`, contact, campaign);
    } else {
      console.log(`Calling contact`, contact, campaign);
    }
    const { error: dequeueError } = await supabase.rpc('dequeue_contact', {
      passed_contact_id: contact.contact_id,
      group_on_household: campaign.group_household_queue,
      dequeued_by_id: owner || null,
      dequeued_reason_text: "Automated queue processing"
    });

    if (dequeueError) {
      console.error(dequeueError);
      throw dequeueError;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    if (campaign.type === "robocall") {
      const response = await fetch(
        getFunctionUrl("ivr-handler"),
        {
          method: 'POST',
          headers: getFunctionHeaders(),
          body: JSON.stringify({
            to_number: contact.phone,
            campaign_id: campaign_id,
            workspace_id: contact.workspace,
            contact_id: contact.contact_id,
            caller_id: contact.caller_id,
            queue_id: contact.id,
            user_id: owner,
            index: 0,
            total: data.length,
            isLastContact: 0 === data.length - 1,
            type: campaign.type,
            owner
          })
        }
      );

      if (!response.ok) {
        await supabase.rpc("handle_campaign_queue_entry", {
          p_contact_id: contact.contact_id,
          p_campaign_id: Number(campaign_id),
          p_requeue: true,
        });
        throw new Error(`ivr-handler failed with status ${response.status}`);
      }

      return new Response(
        JSON.stringify(data),
        { headers: { "Content-Type": "application/json" } },
      )
    } else if (campaign.type === "message") {
      const response = await fetch(
        getFunctionUrl("sms-handler"),
        {
          method: 'POST',
          headers: getFunctionHeaders(),
          body: JSON.stringify({
            to_number: contact.phone,
            campaign_id: campaign_id,
            workspace_id: contact.workspace,
            contact_id: contact.contact_id,
            caller_id: contact.caller_id || campaign.caller_id,
            queue_id: contact.id,
            user_id: owner,
            index: 0,
            total: data.length,
            isLastContact: 0 === data.length - 1,
            type: campaign.type,
            sms_send_mode: campaign.sms_send_mode,
            sms_messaging_service_sid: campaign.sms_messaging_service_sid,
          })
        }
      );
      if (!response.ok) {
        await supabase.rpc("handle_campaign_queue_entry", {
          p_contact_id: contact.contact_id,
          p_campaign_id: Number(campaign_id),
          p_requeue: true,
        });
        throw new Error(`sms-handler failed with status ${response.status}`);
      }
      return new Response(
        JSON.stringify(data),
        { headers: { "Content-Type": "application/json" } },
      )
    } else {
      throw new Error("Unknown campaign type");
    }
  } catch (error) {
    return new Response(
      JSON.stringify(error),
      { headers: { "Content-Type": "application/json" } }
    )
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

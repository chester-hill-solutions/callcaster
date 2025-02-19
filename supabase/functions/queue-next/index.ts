import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const baseUrl = 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';
const functionHeaders = {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": "application/json"
};


Deno.serve(async (req) => {
  try {
    const { campaign_id, owner } = await req.json()
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await supabase.rpc("get_campaign_queue", {
      campaign_id_pro: campaign_id
    });
    if (error || !data) throw error || "No queue found";
    if (!data.length) {
      console.log(`Queue is now empty. Marking completed.`)
      const { error: campaignUpdateError } = await supabase
        .from("campaign")
        .update({ status: "complete" })
        .eq("id", campaign_id);
      if (campaignUpdateError) throw campaignUpdateError
    }
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select('is_active, group_household_queue, type')
      .eq("id", campaign_id)
      .single();
    if (campaignError) throw campaignError;
    if (!campaign.is_active) {
      return new Response(
        JSON.stringify({ status: "campaign_completed" })
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
      group_on_household: campaign.group_household_queue
    });

    if (dequeueError) throw dequeueError;

    await new Promise(resolve => setTimeout(resolve, 200));
    if (campaign.type === "robocall") {
      await fetch(
        `${baseUrl}/ivr-handler`,
        {
          method: 'POST',
          headers: functionHeaders,
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

      return new Response(
        JSON.stringify(data),
        { headers: { "Content-Type": "application/json" } },
      )
    } else if (campaign.type === "message") {
      await fetch(
        `${baseUrl}/sms-handler`,
        {
          method: 'POST',
          headers: functionHeaders,
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
            type: campaign.type
          })
        }
      );
    } else {
      throw new Error("Unknown campaign type");
    }
  } catch (error) {
    return new Response(
      JSON.stringify(error),
      { headers: { "Content-Type": "application/json" } }
    )
  }
})

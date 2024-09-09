import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
};

const fetchWebhook = async (record) => {
  const supabase = initSupabaseClient();
  const { data, error } = await supabase
    .from("webhook")
    .select("*")
    .eq("workspace", record.workspace);
  if (error) {
    console.error("Error fetching webhooks:", error);
    throw error;
  }
  console.log("Fetched webhooks:", data);
  return data;
};

const getResult = async ({ type, record, old_record }) => {
  const webhooks = await fetchWebhook(record);
  if (webhooks && webhooks.length > 0) {
    const webhook = webhooks[0];
    if (webhook.event.includes(type)) {
      const res = await fetch(webhook.destination_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, record, old_record }),
      });
      const responseText = await res.text();
      console.log(`Raw response:`, responseText);
      if (!res.ok) {
        console.error(`Webhook request failed with status ${res.status}`);
        throw new Error(`Error with the webhook event: ${responseText}`);
      }
      try {
        const result = JSON.parse(responseText);
        console.log(`Webhook response:`, result);
        return result;
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
    } else {
      console.log(`Event type ${type} not included in webhook events:`, webhook.event);
      return;
    }
  } else {
    console.log("No webhooks found for the workspace");
    return;
  }
};

Deno.serve(async (req) => {
  try {
    const { type, record, old_record } = await req.json();
    console.log(`Processing outreach event:`, { type, record, old_record });
    const result = await getResult({ type, record, old_record });
    if (result) {
      console.log("Webhook processed successfully");
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.log("No webhook processed");
      return new Response(JSON.stringify({ message: "No action taken" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Server error:", error);
    return new Response(
      JSON.stringify({ error: error.message, status: "error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
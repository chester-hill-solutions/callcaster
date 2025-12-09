import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

interface OutreachAttemptRecord {
  workspace: string;
  type: 'call' | 'sms';
  [key: string]: unknown;
}

interface WebhookEvent {
  category: string;
  type: string;
}

interface Webhook {
  destination_url: string;
  custom_headers?: Record<string, string>;
  events?: WebhookEvent[];
}

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
};

const fetchWebhook = async (record: OutreachAttemptRecord): Promise<Webhook[] | null> => {
  const supabase = initSupabaseClient();
  const { data, error } = await supabase
    .from("webhook")
    .select("*")
    .eq("workspace", record.workspace);
  if (error) {
    console.error("Error fetching webhooks:", error);
    throw error;
  }
  return data;
};

const getResult = async ({ 
  type, 
  record, 
  old_record 
}: { 
  type: string; 
  record: OutreachAttemptRecord; 
  old_record: OutreachAttemptRecord | null 
}): Promise<unknown> => {
  const webhooks = await fetchWebhook(record);
  if (webhooks && webhooks.length > 0) {
    const webhook = webhooks[0];

    // Check if this event type is enabled in the events array
    // For outreach attempts, we use the "outbound_call" or "outbound_sms" category
    // depending on the record type
    const category = record.type === 'call' ? 'outbound_call' : 'outbound_sms';

    const hasMatchingEvent = webhook.events &&
      Array.isArray(webhook.events) &&
      webhook.events.some((event: WebhookEvent) =>
        event.category === category && event.type === type
      );

    if (hasMatchingEvent) {
      const res = await fetch(webhook.destination_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhook.custom_headers || {}),
        },
        body: JSON.stringify({
          event_category: category,
          event_type: type,
          workspace_id: record.workspace,
          timestamp: new Date().toISOString(),
          payload: { type, record, old_record }
        }),
      });
      const responseText = await res.text();
      if (!res.ok) {
        console.error(`Webhook request failed with status ${res.status}`);
        throw new Error(`Error with the webhook event: ${responseText}`);
      }
      try {
        const result = JSON.parse(responseText);

        return result;
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
    } else {
      console.warn(`Event type ${type} for category ${category} not configured in webhook events`);
      return;
    }
  } else {
    console.warn("No webhooks found for the workspace");
    return;
  }
};

Deno.serve(async (req: Request) => {
  try {
    const { type, record, old_record } = await req.json();
    const result = await getResult({ type, record, old_record });
    if (result) {
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ message: "No action taken" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error: unknown) {
    console.error("Server error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, status: "error" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import { handleQueueSyncEvent } from "../_shared/queue-sync.ts";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
};


export async function handleRequest(req: Request): Promise<Response> {
  try {
    const { type, record, old_record } = await req.json();
    console.log('Initiating Queue update: ', type, record, old_record);
    const result = await handleQueueSyncEvent({
      supabase: initSupabaseClient() as any,
      type,
      record,
      old_record,
    });

    if (result) {
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.log("No records found or updated");
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Server error:", error);
    return new Response(JSON.stringify({ error: error.message, status: "error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
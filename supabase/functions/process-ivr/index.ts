// supabase/functions/process-ivr/index.ts
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data, error } = await supabase.rpc('process_ivr_tasks');
    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      result: data
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error('Processing error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
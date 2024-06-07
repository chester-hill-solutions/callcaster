// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const testEmail = "stevenbob312@gmail.com";
const workspaceId = "d915f70e-4f32-4f2f-984f-72e2064e8e3c";

Deno.serve(async (req) => {
  const { data, error } = await supabase
    .from("user")
    .select("username, first_name, last_name")
    .eq("username", "sman")
    .single();

  const { data: callerSignUpData, error: callerSignUpError } =
    await supabase.auth.admin.generateLink({
      type: "signup",
      email: testEmail,
      password: "password1234",
      options: {
        data: {
          user_workspace_role: "caller",
          add_to_workspace: workspaceId,
          first_name: "New",
          last_name: "Caller",
        },
        redirectTo: "http://localhost:3000/signin",
      },
    });

  if (callerSignUpError) {
    return new Response(JSON.stringify(callerSignUpData), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(callerSignUpData), {
    headers: { "Content-Type": "application/json" },
  });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/invite-user-by-email' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

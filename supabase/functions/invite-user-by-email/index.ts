// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import MailService from "npm:@sendgrid/mail@^8.1.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

MailService.setApiKey(Deno.env.get("SENDGRID_API_KEY")!);

Deno.serve(async (req) => {
  const { workspaceId, email, role } = await req.json();
  const { data, error } = await supabase
    .from("user")
    .select("id, username, first_name, last_name")
    .eq("username", email)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify(error), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
  if (data) {
    const { data: invite, error: inviteError } = await supabase
      .from("workspace_invite")
      .insert({ workspace: workspaceId, role, user_id: data.id, isNew:false })
      .select();
      
    if (inviteError) {
      return new Response(JSON.stringify(inviteError), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    const msg = {
      to: email,
      from: "info@callcaster.ca",
      subject: "You have been invited",
      text: `You have been invited to CallCaster to start help making some calls! Join at this link: https://callcaster.ca/accept-invitation, or access the workspace through your dashboard.`,
      html: `<div><h2>You have been invited</h2><br/><p>You have been invited to CallCaster to start help making some calls! <br/><a href="https://callcaster.ca/accept-invitation">Join here</a>, or access the workspace through your dashboard.</p></div>`,
    };

    const result = await MailService.send(msg);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const { data: callerSignUpData, error: callerSignUpError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        user_workspace_role: role,
        add_to_workspace: workspaceId,
        first_name: "New",
        last_name: "Caller",
      },
      redirectTo: `http://localhost:3000/accept-invite`,
    });
    const { data: invite, error: inviteError } = await supabase
      .from("workspace_invite")
      .insert({ workspace: workspaceId, role, user_id: callerSignUpData.user.id })
      .select();
    console.log(invite, inviteError)
  if (callerSignUpError) {
    return new Response(
      JSON.stringify({ ...callerSignUpData, error: callerSignUpError }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
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

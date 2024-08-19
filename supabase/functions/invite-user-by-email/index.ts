import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import MailService from "npm:@sendgrid/mail@^8.1.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

MailService.setApiKey(Deno.env.get("SENDGRID_API_KEY")!);

interface InviteData {
  workspaceId: string;
  email: string;
  role: string;
}

async function getExistingUser(email: string) {
  const { data, error } = await supabase
    .from("user")
    .select("id, username, first_name, last_name")
    .eq("username", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createWorkspaceInvite(workspaceId: string, role: string, userId: string, isNew = false) {
  const { data, error } = await supabase
    .from("workspace_invite")
    .insert({ workspace: workspaceId, role, user_id: userId, isNew })
    .select();

  if (error) throw error;
  return data;
}

async function sendInviteEmail(email: string) {
  const msg = {
    to: email,
    from: "info@callcaster.ca",
    subject: "You have been invited",
    text: `You have been invited to CallCaster to start help making some calls! Join at this link: https://callcaster.ca/accept-invitation, or access the workspace through your dashboard.`,
    html: `<div><h2>You have been invited</h2><br/><p>You have been invited to CallCaster to start help making some calls! <br/><a href="https://callcaster.ca/accept-invitation">Join here</a>, or access the workspace through your dashboard.</p></div>`,
  };

  return await MailService.send(msg);
}

async function inviteNewUser(email: string, workspaceId: string, role: string) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      user_workspace_role: role,
      add_to_workspace: workspaceId,
      first_name: "New",
      last_name: "Caller",
    },
    redirectTo: `${Deno.env.get("SITE_URL")}/accept-invite`,
  });

  if (error) throw error;
  return data;
}

async function handleInvite({ workspaceId, email, role }: InviteData) {
  try {
    const existingUser = await getExistingUser(email);

    if (existingUser) {
      await createWorkspaceInvite(workspaceId, role, existingUser.id, false);
      const result = await sendInviteEmail(email);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const newUserData = await inviteNewUser(email, workspaceId, role);
      await createWorkspaceInvite(workspaceId, role, newUserData.user.id, true);
      return new Response(JSON.stringify(newUserData), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}

Deno.serve(async (req) => {
  const inviteData = await req.json();
  return handleInvite(inviteData);
});
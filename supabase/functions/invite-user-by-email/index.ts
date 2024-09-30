import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import MailService from "npm:@sendgrid/mail@^8.1.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

MailService.setApiKey(Deno.env.get("SENDGRID_API_KEY")!);

interface InviteData {
  workspaceId: string;
  email: string;
  role: string;
}

interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
}

async function getExistingUser(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("user")
    .select("id, username, first_name, last_name")
    .eq("username", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createWorkspaceInvite(
  workspaceId: string,
  role: string,
  userId: string,
  isNew = false,
): Promise<any> {
  const { data, error } = await supabase
    .from("workspace_invite")
    .insert({ workspace: workspaceId, role, user_id: userId, isNew })
    .select(`*`);

  if (error) throw error;
  return data;
}

async function sendInviteEmail(
  email: string,
  workspaceName: string,
  linkData?: { hashed_token: string },
): Promise<[any, any]> {
  const msg = {
    template_id: "d-7690cb26e5464c19a4a1c3f27c64c439",
    from: "info@callcaster.ca",
    personalizations: [
      {
        to: [{ email, name: "" }],
        dynamic_template_data: {
          workspace_name:workspaceName,
          signup_link: linkData?.hashed_token
            ? `${Deno.env.get("SITE_URL")}/accept-invite?token_hash=${linkData.hashed_token}&type=invite&email=${encodeURIComponent(email)}`
            : `${Deno.env.get("SITE_URL")}/accept-invite`,
        },
      },
    ],
  };
  return await MailService.send(msg);
}

async function inviteNewUser(email: string, workspaceId: string, role: string, workspaceName: string): Promise<any> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        user_workspace_role: role,
        add_to_workspace: workspaceId,
        first_name: "New",
        last_name: "Caller",
      },
    },
  });
  
  if (error) throw error;
  
  await sendInviteEmail(email, workspaceName, { hashed_token: data.properties.hashed_token });
  return data;
}
async function getWorkspaceName(id:string){
  const {data, error} = await supabase.from('workspace').select('name').eq("id", id).single();
  if (error) throw error;
  return data.name;
}
async function handleInvite({ workspaceId, email, role }: InviteData): Promise<Response> {
  try {
    if (!workspaceId || !email || !role) {
      throw new Error("Missing required fields");
    }
    const workspaceName = await getWorkspaceName(workspaceId)
    const existingUser = await getExistingUser(email);

    if (existingUser) {
      await createWorkspaceInvite(workspaceId, role, existingUser.id, false);
      const result = await sendInviteEmail(email, workspaceName);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const newUserData = await inviteNewUser(email, workspaceId, role, workspaceName);
      await createWorkspaceInvite(workspaceId, role, newUserData.user.id, true);
      return new Response(JSON.stringify(newUserData), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }
    return new Response(JSON.stringify({ error: "An unknown error occurred" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { "Content-Type": "application/json" },
      status: 405,
    });
  }

  const inviteData = await req.json();
  return handleInvite(inviteData);
});
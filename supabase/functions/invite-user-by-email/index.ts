import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
): Promise<any> {
  const signupLink = linkData?.hashed_token
    ? `${Deno.env.get("SITE_URL")}/accept-invite?token_hash=${linkData.hashed_token}&type=invite&email=${encodeURIComponent(email)}`
    : `${Deno.env.get("SITE_URL")}/accept-invite`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Callcaster <info@callcaster.ca>",
      to: [email],
      subject: `You've been invited to join ${workspaceName} on Callcaster`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited to join ${workspaceName}</h2>
          <p>You've been invited to join the workspace "${workspaceName}" on Callcaster.</p>
          <p><a href="${signupLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p>${signupLink}</p>
        </div>
      `,
      text: `
        You've been invited to join ${workspaceName}
        
        You've been invited to join the workspace "${workspaceName}" on Callcaster.
        
        Accept invitation: ${signupLink}
      `,
    }),
  });

  return await response.json();
}
async function sendMagicEmail(
  email: string,
  workspaceName: string,
  linkData?: { hashed_token: string },
): Promise<any> {
  const signupLink = linkData?.hashed_token
    ? `${Deno.env.get("SITE_URL")}/accept-invite?token_hash=${linkData.hashed_token}&type=magiclink&email=${encodeURIComponent(email)}`
    : `${Deno.env.get("SITE_URL")}/accept-invite`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Callcaster <info@callcaster.ca>",
      to: [email],
      subject: `You've been invited to join ${workspaceName} on Callcaster`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited to join ${workspaceName}</h2>
          <p>You've been invited to join the workspace "${workspaceName}" on Callcaster.</p>
          <p><a href="${signupLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a></p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p>${signupLink}</p>
        </div>
      `,
      text: `
        You've been invited to join ${workspaceName}
        
        You've been invited to join the workspace "${workspaceName}" on Callcaster.
        
        Accept invitation: ${signupLink}
      `,
    }),
  });

  return await response.json();
}

async function inviteNewUser(
  email: string,
  workspaceId: string,
  role: string,
  workspaceName: string,
): Promise<any> {
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

  await sendInviteEmail(email, workspaceName, {
    hashed_token: data.properties.hashed_token,
  });
  return data;
}
async function inviteNewExisting(
  email: string,
  workspaceId: string,
  role: string,
  workspaceName: string,
): Promise<any> {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
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
  console.log(data)
  await sendMagicEmail(email, workspaceName, {
    hashed_token: data.properties.hashed_token,
  });
  return data;
}
async function getWorkspaceName(id: string) {
  const { data, error } = await supabase
    .from("workspace")
    .select("name")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.name;
}
async function handleInvite({
  workspaceId,
  email,
  role,
}: InviteData): Promise<Response> {
  try {
    if (!workspaceId || !email || !role) {
      throw new Error("Missing required fields");
    }
    const workspaceName = await getWorkspaceName(workspaceId);
    const existingUser = await getExistingUser(email);

    if (existingUser) {
      console.log(existingUser)
      await createWorkspaceInvite(workspaceId, role, existingUser.id, false);
      if (
        existingUser.first_name === "New" &&
        existingUser.last_name === "Caller"
      ) {
        const result = await inviteNewExisting(
          email,
          workspaceId,
          role,
          workspaceName,
        );
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }
      const result = await sendInviteEmail(email, workspaceName);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const newUserData = await inviteNewUser(
        email,
        workspaceId,
        role,
        workspaceName,
      );
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
    return new Response(
      JSON.stringify({ error: "An unknown error occurred" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
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

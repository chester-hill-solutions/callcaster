import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, Form } from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  if (serverSession) {
    return redirect('/workspaces');
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token_hash');

  if (!token) {
    return json({ error: 'Invalid invitation link' });
  }

  return json({ token });
}

export async function action({ request }: ActionFunctionArgs) {
  const response = new Response();
  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);

  const formData = await request.formData();
  const password = formData.get('password') as string;
  const token = formData.get('token') as string;

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      token_hash: token,
      type: 'invite',
      password: password,
    });

    if (error) throw error;

    const { error: workspaceError } = await supabaseClient
      .from('workspace_users')
      .insert({
        user_id: data.user.id,
        workspace_id: data.user.user_metadata.workspace_id,
        role: data.user.user_metadata.role,
      });

    if (workspaceError) throw workspaceError;

    return redirect(`/workspaces/${data.user.user_metadata.workspace_id}`);
  } catch (error: any) {
    return json({ error: error.message });
  }
}

export default function AcceptInvite() {
  const { token, error: loaderError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (loaderError) {
    return <div>{loaderError}</div>;
  }

  return (
    <Form method="post">
      <input type="hidden" name="token" value={token} />
      <input
        type="password"
        name="password"
        placeholder="Choose a password"
        required
      />
      <button type="submit">Accept Invite</button>
      {actionData?.error && <p>{actionData.error}</p>}
    </Form>
  );
}
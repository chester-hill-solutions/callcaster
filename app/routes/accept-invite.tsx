import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, Form } from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const {data: {session}, error:sessionError} = await supabase.auth.getSession();

  if (session) {
    return redirect('/workspaces');
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!token) {
    return json({ error: 'Invalid invitation link' });
  }
  const {data: {session: newSession}, error} = await supabase.auth.verifyOtp({token_hash:token, type})
  console.log(newSession);
  if (error) console.error(error)
  return json({ newSession });
}

export const action =  async ({ request }: ActionFunctionArgs) => {
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


    if (workspaceError) throw workspaceError;

    return redirect(`/workspaces/${data.user.user_metadata.workspace_id}`);
  } catch (error: any) {
    return json({ error: error.message });
  }
}

export default function AcceptInvite() {
  const { newSession, error: loaderError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
console.log(newSession)
  if (loaderError) {
    return <div>{loaderError}</div>;
  }

  return (
    <Form method="post">
      <input type="hidden" name="token" value={null} />
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
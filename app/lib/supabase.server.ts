import { redirect } from "@remix-run/node";
import { createServerClient, parse, serialize } from "@supabase/ssr";

export const createSupabaseServerClient = (request: Request) => {
  const cookies = parse(request.headers.get("Cookie") ?? "");
  const headers = new Headers();
  const workspace = cookies['current_workspace_id'];
  const supabaseClient = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(key) {
          return cookies[key];
        },
        set(key, value, options) {
          headers.append("Set-Cookie", serialize(key, value, options));
        },
        remove(key, options) {
          headers.append("Set-Cookie", serialize(key, "", options));
        },
      },
    },
  );
  return { supabaseClient, headers, workspace };
};

export async function getSupabaseServerClientWithSession(request: Request) {
  const { supabaseClient, headers, workspace } = createSupabaseServerClient(request);

  const {
    data: { session: serverSession },
  } = await supabaseClient.auth.getSession();
  if (!serverSession) {
    return redirect("/signin");
  }
  
  return { supabaseClient, headers, serverSession, workspace };
}

export async function getSupabaseServerClientWithUser(request: Request) {
  const { supabaseClient, headers, workspace } = createSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) {
    return redirect("/signin");
  }
  return { supabaseClient, headers, user, workspace };
}

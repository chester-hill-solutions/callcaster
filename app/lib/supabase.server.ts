import { createServerClient, parse, serialize } from "@supabase/ssr";
import { Database } from "./database.types";
import { redirect } from "@remix-run/node";

export const createSupabaseServerClient = (request: Request) => {
  const cookies = parse(request.headers.get("Cookie") ?? "");
  const headers = new Headers();

  const supabaseClient = createServerClient<Database>(
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
  return { supabaseClient, headers };
};

export async function getSupabaseServerClientWithSession(request: Request) {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const nextUrl = new URL(request.url);
  const {
    data: { session: serverSession },
  } = await supabaseClient.auth.getSession();
  if (!serverSession) {
    throw redirect(`/signin?next=${nextUrl.pathname}`);
  }
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();
  if (!user || error){
    throw redirect(`/signin?next=${nextUrl.pathname}`);
  }
  return { supabaseClient, headers, serverSession, user };
}

export async function verifyAuth(request: Request, nextUrl = '/signin') {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();
  if (!user || error){
    throw redirect(`/signin?next=${nextUrl}`);
  }
  return { supabaseClient, headers, user };
}

export async function signOut(request: Request) {
  const { supabaseClient, headers } = createSupabaseServerClient(request);
  await supabaseClient.auth.signOut();
}

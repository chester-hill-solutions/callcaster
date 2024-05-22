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

  const {
    data: { session: serverSession },
  } = await supabaseClient.auth.getSession();

  if (serverSession == null) {
    redirect("http://localhost:3000/signin", { headers });
  }

  return { supabaseClient, headers, serverSession };
}

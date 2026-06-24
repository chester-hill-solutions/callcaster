import { createSupabaseServerClient } from "@/lib/supabase.server";
import { loginWithPassword } from "@/lib/platform-auth.server";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import type { ActionFunctionArgs } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const {supabaseClient, headers} = createSupabaseServerClient(request);
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ user }, { headers });
};

export const action = async ({ request }: ActionFunctionArgs) => {

  const { supabaseClient, headers } = createSupabaseServerClient(request);
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get('next');

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const login = await loginWithPassword(supabaseClient, email, password);

  if (login.ok) {
    if (next && next.startsWith('/') && !next.startsWith('/signin')) {
      return redirect(next, {headers});
    }
    return redirect("/workspaces", { headers });
  }
  logger.error("Sign-in error", login.error);
  return routeData({ error: login.error });
}

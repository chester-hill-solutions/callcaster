import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
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

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (!error) {
    if (next && next.startsWith('/') && !next.startsWith('/signin')) {
      return redirect(next, {headers});
    }
    return redirect("/workspaces", { headers });
  }
  logger.error("Sign-in error", error);
  return routeData({ error: error.message });
}

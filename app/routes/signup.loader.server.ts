import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { supabaseClient, headers } = await verifyAuth(request);
  const { data: serverSession } = await supabaseClient.auth.getSession();

  if (serverSession && serverSession.session) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ serverSession }, { headers });
}

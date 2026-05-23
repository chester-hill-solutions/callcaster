import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data as routeData, redirect, Form, NavLink, useActionData } from "react-router";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { logger } from "@/lib/logger.server";
import { createSupabaseServerClient, verifyAuth } from "@/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {


  const {supabaseClient, headers} = createSupabaseServerClient(request);
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    return redirect("/workspaces", { headers });
  }
  return routeData({ user }, { headers });
}

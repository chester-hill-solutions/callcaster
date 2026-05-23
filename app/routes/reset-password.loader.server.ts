import { data as routeData, Form, useActionData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { data as routeData, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {

  const { supabaseClient } = await verifyAuth(request);
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return redirect("/remember");
  return routeData({});
}

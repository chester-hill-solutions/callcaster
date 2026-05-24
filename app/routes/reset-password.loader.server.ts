import { data as routeData, redirect } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {

  const { supabaseClient } = await verifyAuth(request);
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return redirect("/remember");
  return routeData({});
}

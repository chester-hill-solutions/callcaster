import { redirect, LoaderFunctionArgs, Outlet, useOutlet, useOutletContext } from "react-router";
import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { verifyAuth } from "@/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { headers, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin", { headers });
  }
  return null;
}

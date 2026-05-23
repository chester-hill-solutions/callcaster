import {
  Audience,
  WorkspaceData,
  WorkspaceNumbers,
  Campaign,
} from "@/lib/types";
import { redirect } from "react-router";
import { SupabaseClient } from "@supabase/supabase-js";
import { verifyAuth } from "@/lib/supabase.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { headers, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin", { headers });
  }
  return null;
}

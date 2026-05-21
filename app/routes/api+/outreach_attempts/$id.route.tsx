import { safeParseJson } from "@/lib/database.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData, type ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const { update } = await safeParseJson(request);
  const { id } = params;
  const { data: row, error } = await supabase
    .from("outreach_attempts")
    .update(update)
    .eq("id", id);
  if (error) return routeData({ error }, { status: 400, headers });
  return routeData(row, { headers });
};

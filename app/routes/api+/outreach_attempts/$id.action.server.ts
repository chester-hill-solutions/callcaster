import { data as routeData, type ActionFunctionArgs } from "react-router";
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { safeParseJson } from "@/lib/database.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {


  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const { update } = await safeParseJson<{ update: Record<string, unknown> }>(request);
  const { id } = params;
  if (!id) {
    return routeData({ error: "id is required" }, { status: 400, headers });
  }
  const { data: row, error } = await supabase
    .from("outreach_attempt")
    .update(update)
    .eq("id", Number(id));
  if (error) return routeData({ error }, { status: 400, headers });
  return routeData(row, { headers });
}

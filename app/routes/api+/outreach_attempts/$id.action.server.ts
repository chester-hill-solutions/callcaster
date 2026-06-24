import { requireJsonAuthForOutreachAttempt } from "@/lib/api-route-auth.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { safeParseJson } from "@/lib/database.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { id } = params;
  if (!id) {
    return routeData({ error: "id is required" }, { status: 400 });
  }

  const outreachAttemptId = Number(id);
  if (!Number.isFinite(outreachAttemptId)) {
    return routeData({ error: "id must be a number" }, { status: 400 });
  }

  const access = await requireJsonAuthForOutreachAttempt(
    request,
    outreachAttemptId,
  );
  if (access instanceof Response) return access;

  const { headers } = createSupabaseServerClient(request);
  const { update } = await safeParseJson<{ update: Record<string, unknown> }>(
    request,
  );

  const { data: row, error } = await access.supabase
    .from("outreach_attempt")
    .update(update)
    .eq("id", outreachAttemptId)
    .select()
    .single();

  if (error) return routeData({ error: error.message }, { status: 400, headers });
  return routeData(row, { headers });
};

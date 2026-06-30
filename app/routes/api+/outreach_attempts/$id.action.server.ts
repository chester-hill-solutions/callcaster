import { authForOutreachAttempt } from "@/lib/platform-data.server";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { data as routeData } from "react-router";
import { safeParseJson } from "@/lib/database.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import type { OutreachAttempt } from "@/lib/types";
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

  const access = await authForOutreachAttempt(
    request,
    outreachAttemptId,
  );
  if (access instanceof Response) return access;

  const { headers } = createSupabaseServerClient(request);
  const { update } = await safeParseJson<{ update: Record<string, unknown> }>(
    request,
  );

  const result = await updateOutreachAttemptForWorkspace(
    access.workspaceId,
    outreachAttemptId,
    update as Partial<OutreachAttempt>,
  );

  if (result instanceof Response) {
    const message = await result.text();
    return routeData({ error: message.replace(/^Error updating outreach attempt: /, "") }, {
      status: 400,
      headers,
    });
  }

  return routeData(result, { headers });
};

import { authForResource } from "@/lib/platform-data.server";
import { data as routeData } from "react-router";
import { getSession } from "@/lib/auth.server";
import { defineAction } from "@/lib/handler.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { updateOutreachAttemptForWorkspace } from "@/lib/telephony-db.server";
import type { OutreachAttempt } from "@/lib/types";

const badRequest = (error: string) =>
  new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });

export const action = defineAction({
  auth: ({ request, params }) => {
    if (!params.id) return badRequest("id is required");
    const outreachAttemptId = Number(params.id);
    if (!Number.isFinite(outreachAttemptId)) return badRequest("id must be a number");
    return authForResource(request, "outreach_attempt", outreachAttemptId);
  },
  sideEffects: ["db-write"],
  handler: async ({ request, params, auth }) => {
    const outreachAttemptId = Number(params.id);
    const { headers } = await getSession(request);
    const { update } = await safeParseJson<{ update: Record<string, unknown> }>(request);

    const result = await updateOutreachAttemptForWorkspace(
      auth.workspaceId,
      outreachAttemptId,
      update as Partial<OutreachAttempt>,
    );

    if (result instanceof Response) {
      const message = await result.text();
      return routeData(
        { error: message.replace(/^Error updating outreach attempt: /, "") },
        { status: 400, headers },
      );
    }

    return routeData(result, { headers });
  },
});

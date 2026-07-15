import { data as routeData } from "react-router";
import { acknowledgeCoachingCue } from "@/lib/call-coaching-ack.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { safeParseJson } from "@/lib/request-utils.server";

type CoachingAckBody = {
  coachingEventId?: string;
  workspaceId?: string;
};

export const action = defineAction({
  auth: ({ request }) => requireJsonAuth(request),
  sideEffects: ["db-write"],
  handler: async ({ request, auth }) => {
    const body = await safeParseJson<CoachingAckBody>(request);

    // Data access lives in the lib module: routes may not touch `adminDb`, and
    // the transcription tables have no workspace column to scope on (ADR-0004).
    const result = await acknowledgeCoachingCue({
      user: { id: auth.user.id },
      workspaceId: body.workspaceId?.trim(),
      coachingEventId: body.coachingEventId?.trim(),
    });

    if (!result.ok) {
      return routeData({ error: result.error }, { status: result.status });
    }
    return routeData({ ok: true });
  },
});

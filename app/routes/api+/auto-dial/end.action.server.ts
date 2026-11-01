import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { safeParseJson } from "@/lib/request-utils.server";
import { data as routeData } from "react-router";
import { resolveJsonAuthSession } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { voiceDialerStopBodySchema } from "@/lib/schemas/api/voice-dialer-stop";
import { stopCapturedDialer } from "@/lib/voice-dialer-stop.server";
import { VOICE_AUDIO_ACTOR_HEADER } from "@/lib/voice-audio-connection";

export const action = defineAction({
  auth: async ({ request }) => (await resolveJsonAuthSession(request)).user,
  sideEffects: ["db-write", "twilio"],
  handler: async ({ request, auth: user }) => {
    const parsed = voiceDialerStopBodySchema.safeParse(await safeParseJson<unknown>(request));
    if (!parsed.success) return routeData({ error: "Invalid captured Stop identity" }, { status: 400 });
    const expectedActor = request.headers.get(VOICE_AUDIO_ACTOR_HEADER);
    if (expectedActor && expectedActor !== user.id) return routeData({ error: "The signed-in actor changed" }, { status: 409 });
    await requireWorkspaceAccess({ user, workspaceId: parsed.data.workspaceId });
    const result = await stopCapturedDialer({ workspaceId: parsed.data.workspaceId, userId: user.id,
      campaignId: parsed.data.campaignId, intentId: parsed.data.dial_intent_id }, parsed.data.conferenceName);
    if (!result.ok) return routeData({ error: "The captured dialer request is unavailable" }, { status: result.status });
    return routeData(result.snapshot, { status: result.snapshot.stop_state === "stopped" ? 200 : 202 });
  },
});

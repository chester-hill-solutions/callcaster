import { getSession } from "@/lib/auth.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineLoader } from "@/lib/handler.server";
import { parseVoiceAudioQuery, voiceAudioFailureResponse, voiceAudioSnapshot, voiceAudioIntentSnapshot, voiceAudioActorConflict } from "@/lib/voice-audio-api.server";
import { readOwnedVoiceAudioConnection } from "@/server/voice-audio-lifecycle.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";
import { controlOwnedVoiceAudioIntent } from "@/server/voice-audio-intent-control.server";

export const loader = defineLoader({
  auth: async ({ request }) => {
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;
    const conflict = voiceAudioActorConflict(request, auth.user.id);
    if (conflict) return conflict;
    const headers = auth.authType === "session" ? (await getSession(request)).headers : undefined;
    return { ...auth, headers };
  },
  sideEffects: ["db-read"],
  handler: async ({ request, auth }) => {
    const query = parseVoiceAudioQuery(request);
    if (!query) return Response.json({ error: "Invalid audio connection query" }, { status: 400, headers: auth.headers });
    await requireWorkspaceAccess({ user: auth.user, workspaceId: query.workspaceId });
    if ("connection_intent_id" in query) {
      const result = await controlOwnedVoiceAudioIntent({ workspaceId: query.workspaceId, userId: auth.user.id, intentId: query.connection_intent_id });
      return result.ok ? Response.json(voiceAudioIntentSnapshot(result), { headers: auth.headers }) : voiceAudioFailureResponse(result.reason, auth.headers);
    }
    const result = await readOwnedVoiceAudioConnection({ workspaceId: query.workspaceId, userId: auth.user.id, connectionId: query.connection_id, controlIntentId: query.control_intent_id });
    return result.ok ? Response.json(voiceAudioSnapshot(result.connection), { headers: auth.headers }) : voiceAudioFailureResponse(result.reason, auth.headers);
  },
});

import { getSession } from "@/lib/auth.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineLoader } from "@/lib/handler.server";
import { parseVoiceAudioQuery, voiceAudioFailureResponse, voiceAudioSnapshot } from "@/lib/voice-audio-api.server";
import { readOwnedVoiceAudioConnection } from "@/server/voice-audio-lifecycle.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";

export const loader = defineLoader({
  auth: async ({ request }) => {
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;
    const headers = auth.authType === "session" ? (await getSession(request)).headers : undefined;
    return { ...auth, headers };
  },
  sideEffects: ["db-read"],
  handler: async ({ request, auth }) => {
    const query = parseVoiceAudioQuery(request);
    if (!query) return Response.json({ error: "Invalid audio connection query" }, { status: 400, headers: auth.headers });
    await requireWorkspaceAccess({ user: auth.user, workspaceId: query.workspaceId });
    const result = await readOwnedVoiceAudioConnection({ workspaceId: query.workspaceId, userId: auth.user.id, connectionId: query.connection_id });
    return result.ok ? Response.json(voiceAudioSnapshot(result.connection), { headers: auth.headers }) : voiceAudioFailureResponse(result.reason, auth.headers);
  },
});

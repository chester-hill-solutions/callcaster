import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth.server";
import { requireJsonAuth } from "@/lib/api-auth.server";
import { defineAction } from "@/lib/handler.server";
import { env } from "@/lib/env.server";
import { parseJsonBodyOrResponse } from "@/lib/api-parse.server";
import { connectPhoneDeviceBodySchema } from "@/lib/schemas/api/common";
import { apiWriteRateLimitResponse } from "@/lib/api-write-rate-limit.server";
import { parseVoiceAudioQuery, sendVoiceAudioApiResponse, voiceAudioFailureResponse, voiceAudioSnapshot } from "@/lib/voice-audio-api.server";
import { prepareVoiceAudioConnection } from "@/server/voice-audio-connection.server";
import { cancelOwnedVoiceAudioConnection } from "@/server/voice-audio-lifecycle.server";
import { attemptVoiceAudioCancellation } from "@/lib/voice-audio-recovery.server";
import { requireWorkspaceAccess } from "@/lib/database/workspace.server";

export const action = defineAction({
  auth: async ({ request }) => {
    const auth = await requireJsonAuth(request);
    if (auth instanceof Response) return auth;
    const headers = auth.authType === "session" ? (await getSession(request)).headers : undefined;
    return { ...auth, headers };
  },
  sideEffects: ["twilio", "db-read", "db-write"],
  handler: async ({ request, auth }) => {
    const { headers } = auth;
    if (request.method === "DELETE") {
      const query = parseVoiceAudioQuery(request);
      if (!query) return Response.json({ error: "Invalid audio connection query" }, { status: 400, headers });
      await requireWorkspaceAccess({ user: auth.user, workspaceId: query.workspaceId });
      const result = await cancelOwnedVoiceAudioConnection({ workspaceId: query.workspaceId, userId: auth.user.id, connectionId: query.connection_id });
      if (!result.ok) return voiceAudioFailureResponse(result.reason, headers);
      return Response.json(voiceAudioSnapshot(await attemptVoiceAudioCancellation(result.connection)), { headers });
    }
    if (request.method !== "POST") {
      const replyHeaders = new Headers(headers); replyHeaders.set("Allow", "POST, DELETE");
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: replyHeaders });
    }
    const limited = await apiWriteRateLimitResponse(auth, "api-voice", headers);
    if (limited) return limited;
    const body = await parseJsonBodyOrResponse(request, connectPhoneDeviceBodySchema);
    if (body instanceof Response) return body;
    await requireWorkspaceAccess({ user: auth.user, workspaceId: body.workspaceId });
    const prepared = await prepareVoiceAudioConnection({ workspaceId: body.workspaceId, userId: auth.user.id,
      intentId: body.connection_intent_id ?? randomUUID(), transport: body.device ?? "phone", phoneNumber: body.phoneNumber,
      callSid: body.callSid, expectedAgentSid: body.expected_agent_sid, campaignId: body.campaignId, baseUrl: env.BASE_URL(),
    });
    return prepared.ok ? sendVoiceAudioApiResponse(prepared.connection, headers) : voiceAudioFailureResponse(prepared.reason, headers);
  },
});

import { data as routeData, type LoaderFunctionArgs } from "react-router";
import { env } from "@/lib/env.server";
import { createMediaStreamToken } from "@/lib/media-stream-token.server";
import { requireSessionUserId } from "@/lib/auth.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id } = params;
  try {
    const sessionId = id ?? "unknown";
    const userId = await requireSessionUserId(request);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? sessionId;
    const campaignId = url.searchParams.get("campaignId") ?? "unknown";
    const token = createMediaStreamToken({
      workspaceId,
      campaignId,
      userId,
      sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const mediaStreamUrl = `wss://${env.MEDIA_STREAM_HOST()}/${sessionId}?token=${token}`;
    return routeData({
      success: true,
      message: "Call initiated",
      id: sessionId,
      mediaStreamUrl,
      token,
    });
  } catch (error) {
    return routeData({
      success: false,
      message: "Failed to initiate call",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

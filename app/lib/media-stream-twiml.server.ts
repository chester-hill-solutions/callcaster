import { randomUUID } from "node:crypto";
import { env } from "@/lib/env.server";
import type { WorkspaceFeatureFlags } from "@/lib/coaching-schemas";
import { liveMediaCapabilities } from "@/lib/live-media-capabilities";
import { createMediaStreamToken } from "@/lib/media-stream-token.server";
import { logger } from "@/lib/logger.server";
import type { TwimlResponse } from "@/lib/twilio-twiml.server";

export type LiveTranscriptionDirection = "outbound" | "predictive" | "inbound";

export type LiveTranscriptionStreamParams = {
  workspaceId: string;
  userId: string;
  direction: LiveTranscriptionDirection;
  callId?: string | number | null;
  contactId?: string | number | null;
  campaignId?: string | number | null;
  callSid?: string | null;
  streamName?: string;
};

export type AppendLiveTranscriptionStreamInput = {
  twiml: TwimlResponse;
  featureFlags: WorkspaceFeatureFlags | Record<string, unknown> | null | undefined;
  params: LiveTranscriptionStreamParams;
};

/**
 * Builds the signed WSS URL Twilio connects to for Media Streams.
 * Returns null when the host is unset — the caller skips `<Stream>` and logs.
 */
export function buildMediaStreamWsUrl(sessionId: string, token: string): string | null {
  const host = env.MEDIA_STREAM_HOST()?.trim();
  if (!host) {
    return null;
  }

  const protocol = process.env.NODE_ENV === "production" ? "wss" : "ws";
  return `${protocol}://${host}/${sessionId}?token=${encodeURIComponent(token)}`;
}

/**
 * Appends `<Start><Stream track="both_tracks">` when the workspace's derived
 * capabilities say the stream is needed (live transcription OR live coaching —
 * coaching needs the same audio as its STT input).
 *
 * Never throws: returns false without mutating TwiML when gated off or
 * misconfigured, so the call itself always proceeds. A missing
 * `MEDIA_STREAM_HOST` while the stream was wanted fails closed (no `<Stream>`)
 * and is logged as an error — it is a deploy misconfiguration, not a normal
 * "feature off" path.
 */
export function appendLiveTranscriptionStreamTwiml({
  twiml,
  featureFlags,
  params,
}: AppendLiveTranscriptionStreamInput): boolean {
  if (!liveMediaCapabilities(featureFlags).attachStream) {
    return false;
  }

  const { workspaceId, userId, direction } = params;
  if (!workspaceId || !userId) {
    return false;
  }

  try {
    const sessionId = randomUUID();
    const token = createMediaStreamToken({
      workspaceId,
      campaignId:
        params.campaignId != null ? String(params.campaignId) : "",
      userId,
      sessionId,
      callSid: params.callSid != null ? String(params.callSid) : undefined,
    });

    const url = buildMediaStreamWsUrl(sessionId, token);
    if (!url) {
      logger.error(
        "MEDIA_STREAM_HOST is unset — skipping <Stream> for a workspace with live media enabled",
        {
          guard: "media-stream-host-missing",
          workspaceId,
          direction,
          callSid: params.callSid ?? null,
        },
      );
      return false;
    }

    const streamName =
      params.streamName ??
      (params.callId != null ? `call-${params.callId}` : `stream-${sessionId}`);

    const start = twiml.start();
    const stream = start.stream({
      url,
      track: "both_tracks",
      name: streamName,
    });

    if (params.callId != null) {
      stream.parameter({ name: "callId", value: String(params.callId) });
    }
    stream.parameter({ name: "workspaceId", value: workspaceId });
    stream.parameter({ name: "userId", value: userId });
    if (params.contactId != null) {
      stream.parameter({ name: "contactId", value: String(params.contactId) });
    }
    if (params.campaignId != null) {
      stream.parameter({ name: "campaignId", value: String(params.campaignId) });
    }
    stream.parameter({ name: "direction", value: direction });
    if (params.callSid) {
      stream.parameter({ name: "callSid", value: params.callSid });
    }

    return true;
  } catch (error) {
    logger.warn("Skipping live transcription stream TwiML", {
      workspaceId,
      direction,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

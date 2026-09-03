import crypto from "node:crypto";
import { env } from "./env.server";

export type MediaStreamTokenPayload = {
  workspaceId: string;
  campaignId: string;
  userId: string;
  sessionId: string;
  /** Twilio Call SID this stream is authorized for, when known at mint time. */
  callSid?: string;
  /** Unix timestamp (seconds) when the token expires. */
  exp: number;
};

export type CreateMediaStreamTokenInput = Omit<MediaStreamTokenPayload, "exp"> & {
  /** Unix timestamp (seconds) when the token expires. Defaults to 1 hour from now. */
  exp?: number;
};

/**
 * Signs a compact HMAC token for a media-stream WebSocket session.
 * Format: base64url(payload).base64url(signature)
 */
export function createMediaStreamToken({
  workspaceId,
  campaignId,
  userId,
  sessionId,
  callSid,
  exp,
}: CreateMediaStreamTokenInput): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: MediaStreamTokenPayload = {
    workspaceId,
    campaignId,
    userId,
    sessionId,
    ...(callSid ? { callSid } : {}),
    exp: exp ?? nowSeconds + 3600,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.MEDIA_STREAM_SECRET())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

/**
 * Verifies a media-stream token signature and expiry.
 * @throws Error if the token is malformed, tampered with, or expired.
 */
export function verifyMediaStreamToken(token: string): MediaStreamTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid media-stream token: expected 2 parts");
  }

  const [encoded, signature] = parts;
  if (!encoded || !signature) {
    throw new Error("Invalid media-stream token: missing payload or signature");
  }

  const expected = crypto
    .createHmac("sha256", env.MEDIA_STREAM_SECRET())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) {
    throw new Error("Invalid media-stream token: signature mismatch");
  }

  const match = crypto.timingSafeEqual(sigBuf, expectedBuf);
  if (!match) {
    throw new Error("Invalid media-stream token: signature mismatch");
  }

  let payload: MediaStreamTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    throw new Error("Invalid media-stream token: malformed payload");
  }

  if (typeof payload.exp !== "number") {
    throw new Error("Invalid media-stream token: missing expiry");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Media-stream token expired");
  }

  return payload;
}

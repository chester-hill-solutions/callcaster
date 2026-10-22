import { describe, expect, test, beforeEach } from "vitest";
import {
  createMediaStreamToken,
  verifyMediaStreamToken,
  type MediaStreamTokenPayload,
} from "@/lib/media-stream-token.server";

describe("media-stream-token", () => {
  const basePayload: Omit<MediaStreamTokenPayload, "exp"> = {
    workspaceId: "ws-1",
    campaignId: "camp-1",
    userId: "user-1",
    sessionId: "session-1",
    callSid: "CA-token-1",
  };

  beforeEach(() => {
    process.env.MEDIA_STREAM_SECRET = "test-media-stream-secret";
  });

  test("creates a token that can be verified and returns the payload", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createMediaStreamToken({ ...basePayload, exp: now + 60 });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = verifyMediaStreamToken(token);
    expect(verified).toEqual({ ...basePayload, exp: now + 60 });
  });

  test("defaults expiry to one hour when not provided", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = createMediaStreamToken(basePayload);
    const after = Math.floor(Date.now() / 1000);

    const verified = verifyMediaStreamToken(token);
    expect(verified.exp).toBeGreaterThanOrEqual(before + 3600);
    expect(verified.exp).toBeLessThanOrEqual(after + 3600);
  });

  test("rejects a token signed with a different secret", () => {
    const token = createMediaStreamToken({ ...basePayload, exp: Math.floor(Date.now() / 1000) + 60 });
    process.env.MEDIA_STREAM_SECRET = "different-secret";
    expect(() => verifyMediaStreamToken(token)).toThrow("signature mismatch");
  });

  test("rejects an expired token", () => {
    const token = createMediaStreamToken({ ...basePayload, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(() => verifyMediaStreamToken(token)).toThrow("expired");
  });

  test("rejects a malformed token", () => {
    expect(() => verifyMediaStreamToken("not-a-token")).toThrow("expected 2 parts");
  });

  test("rejects a token with a tampered payload", () => {
    const token = createMediaStreamToken({ ...basePayload, exp: Math.floor(Date.now() / 1000) + 60 });
    const [encoded] = token.split(".");
    const tampered = `${encoded}-extra.${token.split(".")[1]}`;
    expect(() => verifyMediaStreamToken(tampered)).toThrow("signature mismatch");
  });

  // #2889: the call SID is the row key for the service's unscoped writes, so a
  // token without one would authorize writes on a call it never named.
  test("refuses to mint a token with no call SID", () => {
    expect(() =>
      createMediaStreamToken({ ...basePayload, callSid: "" }),
    ).toThrow("callSid is required");
    expect(() =>
      createMediaStreamToken({ ...basePayload, callSid: "   " }),
    ).toThrow("callSid is required");

    const omitted: Record<string, unknown> = { ...basePayload };
    delete omitted.callSid;
    expect(() => createMediaStreamToken(omitted as never)).toThrow(
      "callSid is required",
    );
  });

  test("the call SID is part of the signed payload", () => {
    const token = createMediaStreamToken({
      ...basePayload,
      callSid: "CA-signed",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyMediaStreamToken(token).callSid).toBe("CA-signed");
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveInboundVoicemailAudio, appendInboundVoicemailTwiml } from "@/lib/inbound-voicemail-twiml.server";
import { createVoiceResponse } from "@/lib/twilio-twiml.server";

vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return { ...actual, env: { ...actual.env,
    BASE_URL: () => "https://base.example",
    S3_ENDPOINT: () => "https://storage.example",
    S3_REGION: () => "us-east-1",
    S3_ACCESS_KEY_ID: () => "test-key",
    S3_SECRET_ACCESS_KEY: () => "test-secret",
    S3_BUCKET: () => "test-bucket",
    S3_BUCKET_AUDIO: () => undefined,
  } };
});

vi.mock("@aws-sdk/s3-request-presigner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/s3-request-presigner")>()),
  getSignedUrl: vi.fn(async () => "https://signed.example/greeting.mp3"),
}));

describe("inbound voicemail greeting availability through the storage adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  async function render(inboundAudio: string | null) {
    const audio = await resolveInboundVoicemailAudio({ workspaceId: "w1", inboundAudio });
    const twiml = createVoiceResponse();
    appendInboundVoicemailTwiml({ twiml, phoneNumber: "+15551234567", voicemailAudioUrl: audio?.signedUrl ?? null });
    return twiml.toString();
  }

  function expectFallback(xml: string) {
    expect(xml).toContain("Thank you for calling +15551234567");
    expect(xml).not.toContain("<Play>");
    expect(xml).toContain("<Record");
    expect(getSignedUrl).not.toHaveBeenCalled();
  }

  test("plays an existing workspace greeting after checking its actual object key", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    expect(await render("greeting.mp3")).toContain("<Play>https://signed.example/greeting.mp3</Play>");
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: { Bucket: "test-bucket", Key: "workspaceAudio/w1/greeting.mp3" } }));
  });

  test("a missing configured object uses speech even though S3 can sign a missing key", async () => {
    vi.spyOn(S3Client.prototype, "send")
      .mockRejectedValueOnce(Object.assign(new Error("Missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }))
      .mockResolvedValueOnce({ Contents: [] });
    expectFallback(await render("deleted.mp3"));
  });

  test("storage failure keeps voicemail capture with the spoken fallback", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(new Error("Storage offline"));
    expectFallback(await render("greeting.mp3"));
  });

  test("a listed greeting that disappears before playback is not signed", async () => {
    vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: "workspaceAudio/w1/greeting.mp3" }] })
      .mockRejectedValueOnce(Object.assign(new Error("Deleted"), { name: "NotFound" }));
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("Signing failed"));
    const xml = await render("greeting.mp3");
    expect(xml).not.toContain("<Play>");
    expect(xml).toContain("Thank you for calling +15551234567");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  test("retains the workspace listing retry after a signing failure", async () => {
    const send = vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: "workspaceAudio/w1/greeting.mp3" }] })
      .mockResolvedValueOnce({});
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("Signing failed"));
    expect(await render("greeting.mp3")).toContain("<Play>https://signed.example/greeting.mp3</Play>");
    expect(send).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  test("no configured greeting needs no storage request", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    expectFallback(await render(null));
    expect(send).not.toHaveBeenCalled();
  });
});

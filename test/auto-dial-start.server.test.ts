import { beforeEach, describe, expect, test, vi } from "vitest";
import { autoDialCreditsErrorResponse, startAutoDialConference } from "@/lib/auto-dial-start.server";

const boundary = vi.hoisted(() => ({ admit: vi.fn(), replay: vi.fn(), create: vi.fn(), send: vi.fn(),
  verified: ["+15550001111"] as string[] }));
vi.mock("@/server/predictive-voice-admission.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/predictive-voice-admission.server")>(),
  admitPredictiveVoiceRecipient: boundary.admit, replayPredictiveConferenceStart: boundary.replay,
}));
vi.mock("@/lib/manual-voice-dispatch.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/manual-voice-dispatch.server")>(), dispatchStartedVoiceSetup: boundary.send,
}));
vi.mock("@/lib/user-audio.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/user-audio.server")>(), getUserVerifiedAudioNumbers: async () => boundary.verified,
}));
vi.mock("@/lib/database/workspace.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/database/workspace.server")>(),
  createWorkspaceTwilioInstance: async () => ({ accountSid: "ACfixture", calls: { create: boundary.create } }),
}));

const input = { userId: "u1", workspaceId: "w1", campaignId: 1, callerId: "+1555", selectedDevice: "computer" };
describe("conference start adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks(); boundary.verified = ["+15550001111"];
    boundary.admit.mockReset(); boundary.replay.mockReset().mockResolvedValue(null);
    boundary.create.mockReset().mockResolvedValue({ sid: "CAfixture" });
    boundary.send.mockReset().mockImplementation(async (_reservation: unknown, create: () => Promise<{ sid: string }>) => create());
  });
  test("maps an atomic funding refusal to the locked credit response", async () => {
    boundary.admit.mockResolvedValue({ ok: false, reason: "insufficient_credits", balance: 1 });
    expect(await startAutoDialConference(input)).toEqual({ ok: false, status: 402, error: "Insufficient credits", creditsError: true });
    expect(boundary.create).not.toHaveBeenCalled(); expect(boundary.send).not.toHaveBeenCalled();
  });
  test("maps a missing workspace to a uniform 404 before the provider", async () => {
    boundary.admit.mockResolvedValue({ ok: false, reason: "workspace_not_found" });
    expect(await startAutoDialConference(input)).toEqual({ ok: false, status: 404, error: "Workspace not found" });
    expect(boundary.create).not.toHaveBeenCalled();
  });
  test("uses the committed setup target and callback URLs", async () => {
    boundary.admit.mockResolvedValue({ ok: true, reservation: { setup_to: "client:u1", caller_id: "+1555", queue_id: 1,
      setup_voice_url: "https://fixture.test/voice?credit_reservation=owned", setup_status_callback: "https://fixture.test/status?credit_reservation=owned" } });
    expect(await startAutoDialConference(input)).toMatchObject({ ok: true, conferenceName: expect.stringMatching(/^u1~/) });
    expect(boundary.create).toHaveBeenCalledExactlyOnceWith({ to: "client:u1", from: "+1555",
      url: "https://fixture.test/voice?credit_reservation=owned", statusCallback: "https://fixture.test/status?credit_reservation=owned",
      statusCallbackEvent: ["answered", "completed", "ringing"] });
  });
  test("refuses an unverified phone before new admission", async () => {
    expect(await startAutoDialConference({ ...input, selectedDevice: "+15559999999" })).toEqual({ ok: false, status: 400,
      error: "Selected device is not a verified phone number" });
    expect(boundary.admit).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
  });
  test("a malformed intent cannot create a start owner", async () => {
    expect(await startAutoDialConference({ ...input, dialIntentId: "bad" })).toMatchObject({ ok: false, status: 400 });
    expect(boundary.replay).not.toHaveBeenCalled(); expect(boundary.admit).not.toHaveBeenCalled();
    expect(boundary.create).not.toHaveBeenCalled();
  });
});

describe("autoDialCreditsErrorResponse", () => {
  test("returns the locked 402 blocked shape", () => {
    const response = autoDialCreditsErrorResponse();
    expect(response.data).toEqual({ error: "Insufficient credits", creditsError: true });
    expect(response.init?.status).toBe(402);
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { VoiceReservation } from "@/server/voice-credit-reservation.server";
import { dispatchStartedVoiceSetup } from "@/lib/manual-voice-dispatch.server";
import { VoiceDispatchUncertainError } from "@/lib/voice-credit-dispatch.server";

const storage = vi.hoisted(() => ({ known: vi.fn(), record: vi.fn(), defer: vi.fn(), release: vi.fn() }));
vi.mock("@/server/voice-credit-reservation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-credit-reservation.server")>(),
  deferVoiceReservation: storage.defer, releaseUnsentVoiceReservation: storage.release,
}));
vi.mock("@/server/voice-bridge-reservation.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/voice-bridge-reservation.server")>(),
  knownVoiceSetupSid: storage.known, recordVoiceBridgeSetupProvider: storage.record,
}));

function reservation(): VoiceReservation {
  return {
    id: "00000000-0000-4000-8000-000000000001", workspace: "00000000-0000-4000-8000-000000000002",
    kind: "staffed", credits: 4, account_sid: "ACfixture", recipient: "+16135550101", caller_id: "+16135550102",
    campaign_id: null, contact_id: null, outreach_attempt_id: null, requested_outreach_attempt_id: null,
    queue_id: null, queue_generation: null, operation_key: "owned-start", user_id: null,
    setup_to: "client:owned-agent", conference_id: null, conference_sid: null, predictive_operation_id: null,
    setup_voice_url: "https://fixture.example/voice", setup_status_callback: "https://fixture.example/status",
    recipient_instruction_issued_at: null, recipient_refused_at: null, setup_terminal_at: null, setup_terminal_status: null,
    terminal_status: null, terminal_duration: null, voice_url: null, status_callback: "https://fixture.example/recipient-status",
    state: "creating", provider_sid: null, setup_sid: null, lease_token: "00000000-0000-4000-8000-000000000003",
    lease_expires_at: new Date(Date.now() + 60_000), send_started_at: new Date(), last_error: null,
    created_at: new Date(), updated_at: new Date(),
  };
}

describe("one-send setup uncertainty", () => {
  beforeEach(() => {
    storage.known.mockReset().mockResolvedValue(null); storage.record.mockReset().mockResolvedValue(undefined);
    storage.defer.mockReset().mockResolvedValue(undefined); storage.release.mockReset();
  });
  test.each(["receipt read", "uncertainty write", "both"])("%s failure cannot erase an uncertain provider POST", async (mode) => {
    if (mode !== "uncertainty write") storage.known.mockRejectedValue(new Error("Owned receipt read failure"));
    if (mode !== "receipt read") storage.defer.mockRejectedValue(new Error("Owned uncertainty write failure"));
    const create = vi.fn().mockRejectedValue(new Error("Owned response lost"));
    await expect(dispatchStartedVoiceSetup(reservation(), create)).rejects.toBeInstanceOf(VoiceDispatchUncertainError);
    expect(create).toHaveBeenCalledOnce(); expect(storage.release).not.toHaveBeenCalled();
  });
  test("a local acceptance-write fault retains pending classification", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "CAaccepted" });
    storage.record.mockRejectedValue(new Error("Owned acceptance write failure"));
    storage.known.mockRejectedValue(new Error("Owned receipt read failure"));
    await expect(dispatchStartedVoiceSetup(reservation(), create)).rejects.toBeInstanceOf(VoiceDispatchUncertainError);
    expect(create).toHaveBeenCalledOnce(); expect(storage.release).not.toHaveBeenCalled();
  });
  test("a known signed acceptance returns its original setup without another POST", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Owned response lost"));
    storage.known.mockResolvedValue("CAaccepted");
    expect(await dispatchStartedVoiceSetup(reservation(), create)).toMatchObject({ ok: true, callSid: "CAaccepted", replayed: true });
    expect(create).toHaveBeenCalledOnce(); expect(storage.release).not.toHaveBeenCalled(); expect(storage.defer).not.toHaveBeenCalled();
  });
});

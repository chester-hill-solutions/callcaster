import { describe, expect, it } from "vitest";
import { voiceRecordingCustomerSlices as selectSlices } from "@/lib/voice-recording-timeline";

const startedAt = new Date("2026-11-01T14:00:00Z");
const recording = { startedAt, durationSeconds: 60 };
const customer = "CA00000000000000000000000000000001";
const voiceRecordingCustomerSlices = (recording: Parameters<typeof selectSlices>[0], events: Parameters<typeof selectSlices>[1]) => selectSlices(recording, events, customer);
const join = (sequence: number, seconds: number) => ({ event: "participant-join" as const, sequence_number: sequence,
  participant_call_sid: customer, occurred_at: new Date(startedAt.getTime() + seconds * 1000) });
const leave = (sequence: number, seconds: number) => ({ ...join(sequence, seconds), event: "participant-leave" as const });

describe("customer recording intervals", () => {
  it("keeps offsets at the provider clock and clips to the physical file", () => {
    expect(voiceRecordingCustomerSlices(recording, [leave(6, 80), join(5, 40), leave(4, 10), join(3, -20)]))
      .toEqual({ state: "provisional", slices: [{ startMs: 0, endMs: 10_000 }, { startMs: 40_000, endMs: 60_000 }] });
  });
  it("does not include audio when the customer was outside the capture", () => {
    expect(voiceRecordingCustomerSlices(recording, [join(3, 70), leave(4, 80)]))
      .toEqual({ state: "provisional", slices: [] });
  });
  it.each([
    ["no history", [], "missing_membership"],
    ["only leave", [leave(8, 10)], "missing_membership"],
    ["only join", [join(3, 10)], "open_membership"],
    ["two joins", [join(3, 10), join(4, 20)], "missing_membership_leave"],
    ["time reversal", [join(3, 30), leave(4, 10)], "conflicting_membership_order"],
    ["missing leave and rejoin", [join(7, 10), leave(22, 50)], "membership_sequence_gap"],
    ["duplicate sequence", [join(3, 10), leave(3, 20)], "conflicting_membership_order"],
    ["missing provider time", [{ ...join(3, 10), occurred_at: null }], "unproven_membership_time"],
    ["invalid provider time", [{ ...join(3, 10), occurred_at: new Date(NaN) }], "unproven_membership_time"],
    ["missing sequence", [{ ...join(3, 10), sequence_number: null }], "unproven_membership_time"],
    ["excessive history", Array.from({ length: 1001 }, (_, n) => join(n, n)), "membership_limit"],
  ])("leaves %s pending", (_name, events, reason) => {
    expect(voiceRecordingCustomerSlices(recording, events)).toEqual({ state: "pending", reason });
  });
  it.each([null, new Date(NaN)])("requires the recording start time %s", (startedAt) => {
    expect(voiceRecordingCustomerSlices({ ...recording, startedAt }, [join(3, 0), leave(8, 10)]))
      .toEqual({ state: "pending", reason: "missing_recording_time" });
  });
  it.each([null, -1, 0.5, NaN, Infinity])("requires a known recording duration %s", (durationSeconds) => {
    expect(voiceRecordingCustomerSlices({ ...recording, durationSeconds }, [join(3, 0), leave(8, 10)]))
      .toEqual({ state: "pending", reason: "missing_recording_time" });
  });
});

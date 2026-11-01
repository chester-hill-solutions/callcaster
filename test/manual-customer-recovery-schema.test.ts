import { describe, expect, test } from "vitest";
import { voiceAudioCurrentSnapshotSchema } from "@/lib/schemas/api/voice-audio";
import { manualRecovery } from "./helpers/manual-recovery-fixture";
import { current } from "./helpers/voice-audio-current-fixture";

describe("manual recovery wire ownership", () => {
  test.each(["ringing", "in-progress", "completed"] as const)("accepts the exact saved %s customer", provider_status => {
    expect(voiceAudioCurrentSnapshotSchema.safeParse({ ...current(), customer_pending: true, manual: manualRecovery({ provider_status }) }).success).toBe(true);
  });
  test.each(["workspace", "actor", "attempt", "agent", "busy", "audio-pair"])("rejects mismatched %s before adopting a customer", mismatch => {
    const manual = manualRecovery(), snapshot = { ...current(), customer_pending: true, manual };
    if (mismatch === "workspace") manual.workspace_id = "10000000-0000-4000-8000-000000000099";
    if (mismatch === "actor") manual.user_id = "other-agent";
    if (mismatch === "attempt") manual.attempt = { ...manual.attempt, id: 99 };
    if (mismatch === "agent") manual.call_sid = manual.agent_call_sid;
    if (mismatch === "busy") snapshot.customer_pending = false;
    if (mismatch === "audio-pair") manual.request.audio_generation = null;
    expect(voiceAudioCurrentSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
  test("an older server still retains its busy gate without manual recovery", () => {
    const { manual: _manual, ...legacy } = current();
    expect(voiceAudioCurrentSnapshotSchema.parse({ ...legacy, customer_pending: true })).toMatchObject({ customer_pending: true, manual: null });
  });
});

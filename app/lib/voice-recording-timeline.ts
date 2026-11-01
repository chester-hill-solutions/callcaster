type MembershipEvent = { event: string; participant_call_sid: string | null; sequence_number: number | null; occurred_at: Date | null };
type RecordingTime = { startedAt: Date | null; durationSeconds: number | null };
export type VoiceRecordingSlice = { startMs: number; endMs: number };
const pending = (reason: string) => ({ state: "pending" as const, reason });

function recordingRange(recording: RecordingTime) {
  if (!recording.startedAt || !Number.isFinite(recording.startedAt.getTime()) || recording.durationSeconds === null ||
      !Number.isSafeInteger(recording.durationSeconds) || recording.durationSeconds < 0) return null;
  const start = recording.startedAt.getTime();
  return { start, end: start + recording.durationSeconds * 1000 };
}

/** Offsets within one physical recording, never a claim that the whole call is complete. */
export function voiceRecordingCustomerSlices(recording: RecordingTime, events: MembershipEvent[], customerCallSid: string) {
  if (!events.some(row => row.participant_call_sid === customerCallSid && row.event === "participant-join")) return pending("missing_membership");
  if (events.length > 1000) return pending("membership_limit");
  const range = recordingRange(recording);
  if (!range) return pending("missing_recording_time");
  if (events.some(row => row.sequence_number === null || !Number.isSafeInteger(row.sequence_number) || row.sequence_number < 0 ||
      !row.occurred_at || !Number.isFinite(row.occurred_at.getTime()))) return pending("unproven_membership_time");
  const sorted = [...events].sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const slices: VoiceRecordingSlice[] = [];
  const { start: recordingStart, end: recordingEnd } = range;
  let joinedAt: number | null = null, previousTime = -Infinity, previousSequence = -1;
  for (const row of sorted) {
    const time = row.occurred_at?.getTime() ?? NaN, sequence = Number(row.sequence_number);
    if (sequence <= previousSequence || time < previousTime) return pending("conflicting_membership_order");
    if (previousSequence !== -1 && sequence !== previousSequence + 1) return pending("membership_sequence_gap");
    previousTime = time; previousSequence = sequence;
    if (row.participant_call_sid !== customerCallSid || row.event !== "participant-join" && row.event !== "participant-leave") continue;
    if (row.event === "participant-join") {
      if (joinedAt !== null) return pending("missing_membership_leave");
      joinedAt = time;
    } else {
      if (joinedAt === null) return pending("missing_membership_join");
      const start = Math.max(joinedAt, recordingStart), end = Math.min(time, recordingEnd);
      if (end > start) slices.push({ startMs: start - recordingStart, endMs: end - recordingStart });
      joinedAt = null;
    }
  }
  if (joinedAt !== null) return pending("open_membership");
  // A covered observed range does not prove that earlier/later events are complete.
  // Full assembly still needs its recording/call boundary completeness witness.
  return { state: "provisional" as const, slices };
}

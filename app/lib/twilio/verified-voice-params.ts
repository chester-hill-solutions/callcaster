/** Normalize only after verifying the signature over the original form body. */
export function normalizeVerifiedVoiceParams(params: Record<string, string>) {
  const fields = [
    ["CallSid", "call_sid"], ["ParentCallSid", "parent_call_sid"], ["AccountSid", "account_sid"],
    ["CallStatus", "call_status"], ["CallDuration", "call_duration"], ["Duration", "duration"],
    ["To", "to"], ["From", "from"], ["Direction", "direction"],
    ["FriendlyName", "friendly_name"], ["ConferenceSid", "conference_sid"],
    ["StatusCallbackEvent", "status_callback_event"], ["Muted", "muted"], ["ParticipantLabel", "participant_label"],
    ["Digits", "digits"],
    ["ReasonParticipantLeft", "reason_participant_left"], ["Timestamp", "timestamp"],
  ] as const;
  for (const [canonical, alias] of fields) {
    if (params[canonical] !== undefined && params[alias] !== undefined && params[canonical] !== params[alias]) return false;
  }
  for (const [canonical, alias] of fields) {
    if (params[canonical] === undefined && params[alias] !== undefined) params[canonical] = params[alias];
  }
  return true;
}

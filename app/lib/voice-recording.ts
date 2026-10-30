export class VoiceRecordingBindingError extends Error {
  constructor(message: string) { super(message); this.name = "VoiceRecordingBindingError"; }
}

export function voiceRecordingCallbackUrl(baseUrl: string, operationId: string) {
  const url = new URL("/api/voice-recording", baseUrl);
  url.searchParams.set("recording", operationId);
  return url.href;
}

export type VoiceRecordingReceipt = {
  requestUrl: string;
  accountSid: string;
  callSid: string;
  recordingSid: string;
  source: string;
  status: "in-progress" | "completed" | "absent";
  startedAt?: Date;
  durationSeconds?: number;
  channels?: 1 | 2;
};

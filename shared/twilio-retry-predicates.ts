/** Runtime-agnostic Twilio retry predicates shared by app and edge functions. */

function readCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (typeof record.status === "number") return record.status;
  return null;
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isRetryableSmsTwilioError(error: unknown): boolean {
  const code = readCode(error);
  const status = readStatus(error);
  if (status === 429) return true;
  if (status != null && status >= 500) return true;
  if (code === 20429 || code === 20500 || code === 20503) return true;
  if (code === 30022 || code === 30001) return true;
  const message = readMessage(error).toLowerCase();
  return message.includes("timeout") || message.includes("econnreset");
}

export function isRetryableVoiceTwilioError(error: unknown): boolean {
  const code = readCode(error);
  const status = readStatus(error);
  if (status === 429 || status === 503) return true;
  if (status != null && status >= 500) return true;
  if (code === 20429 || code === 31206 || code === 10004) return true;
  const message = readMessage(error).toLowerCase();
  return message.includes("timeout") || message.includes("econnreset");
}

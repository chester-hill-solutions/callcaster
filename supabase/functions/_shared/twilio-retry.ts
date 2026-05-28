export type TwilioRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  operation: string;
};

import {
  PROVIDER_BASE_DELAY_MS,
  PROVIDER_MAX_ATTEMPTS,
} from "./queue-policy.ts";

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

function jitterDelay(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt + Math.floor(Math.random() * baseMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTwilioRetry<T>(
  fn: () => Promise<T>,
  options: TwilioRetryOptions & {
    isRetryable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? PROVIDER_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? PROVIDER_BASE_DELAY_MS;
  const isRetryable = options.isRetryable ?? isRetryableSmsTwilioError;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = isRetryable(error);
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      console.warn("Twilio call failed; retrying", {
        operation: options.operation,
        attempt: attempt + 1,
        maxAttempts,
        code: readCode(error),
        status: readStatus(error),
      });
      await sleep(jitterDelay(baseDelayMs, attempt));
    }
  }

  throw lastError;
}

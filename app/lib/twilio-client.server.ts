import Twilio from "twilio";

import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { isRetryableTwilioError, presentTwilioError } from "@/lib/twilio-errors";

export type TwilioClientCallOptions = {
  workspaceId?: string;
  operation: string;
  maxAttempts?: number;
  baseDelayMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterDelay(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** attempt;
  return exp + Math.floor(Math.random() * baseMs);
}

/**
 * Run a Twilio REST operation with retry for transient failures.
 * Re-throws the last error after exhausting attempts.
 */
export async function withTwilioRetry<T>(
  fn: () => Promise<T>,
  options: TwilioClientCallOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableTwilioError(error);
      const presented = presentTwilioError(error);
      logger.warn("Twilio REST call failed", {
        operation: options.operation,
        workspaceId: options.workspaceId ?? null,
        attempt: attempt + 1,
        maxAttempts,
        retryable,
        twilioCode: presented.twilioCode,
        httpStatus: presented.httpStatus,
      });
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      await sleep(jitterDelay(baseDelayMs, attempt));
    }
  }

  throw lastError;
}

export async function createWorkspaceTwilioClient({
    workspaceId,
}: {
  workspaceId: string;
}): Promise<Twilio.Twilio> {
  return createWorkspaceTwilioInstance({ workspace_id: workspaceId });
}

export type MessagingServiceCreateInput = {
  friendlyName: string;
};

export async function createMessagingService(
  twilio: Twilio.Twilio,
  input: MessagingServiceCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.services.create({ friendlyName: input.friendlyName }),
    options,
  );
}

export async function updateMessagingService(
  twilio: Twilio.Twilio,
  serviceSid: string,
  update: Record<string, unknown>,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.services(serviceSid).update(update),
    options,
  );
}

export async function attachPhoneNumberToMessagingService(
  twilio: Twilio.Twilio,
  serviceSid: string,
  phoneNumberSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.messaging.v1.services(serviceSid).phoneNumbers.create({
        phoneNumberSid,
      }),
    options,
  );
}

export async function listMessagingServicePhoneNumbers(
  twilio: Twilio.Twilio,
  serviceSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.services(serviceSid).phoneNumbers.list({ limit: 200 }),
    options,
  );
}

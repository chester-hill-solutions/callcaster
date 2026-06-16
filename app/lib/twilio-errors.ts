/**
 * Normalize Twilio SDK / REST failures into user-safe and admin-facing shapes.
 */

import {
  isRetryableSmsTwilioError,
  isRetryableVoiceTwilioError,
} from "../../shared/twilio-retry-predicates";

export type TwilioErrorPresentation = {
  userMessage: string;
  adminDetail: string;
  twilioCode: number | null;
  httpStatus: number | null;
  retryable: boolean;
  suggestedAction: string;
};

function readTwilioCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const o = error as Record<string, unknown>;
  if (typeof o.code === "number") return o.code;
  if (typeof o.status === "number" && o.status >= 400) return o.status;
  return null;
}

function readHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : null;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected Twilio error occurred.";
}

/** Whether a Twilio failure is worth retrying (429, 5xx, network, known transient codes). */
export function isRetryableTwilioError(error: unknown): boolean {
  return isRetryableSmsTwilioError(error);
}

export { isRetryableVoiceTwilioError };

export function presentTwilioError(error: unknown): TwilioErrorPresentation {
  const message = readMessage(error);
  const code = readTwilioCode(error);
  const httpStatus = readHttpStatus(error);
  const lower = message.toLowerCase();

  if (lower.includes("credit") || code === 20003) {
    return {
      userMessage: "Your workspace does not have enough credits for this action.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: false,
      suggestedAction: "Add credits in workspace billing, then try again.",
    };
  }

  if (code === 21422 || lower.includes("not available")) {
    return {
      userMessage: "That phone number is no longer available. Search again and pick another number.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: false,
      suggestedAction: "Run a new number search.",
    };
  }

  if (code === 21606 || lower.includes("messaging service")) {
    return {
      userMessage:
        "Messaging Service setup is incomplete. Finish workspace onboarding or contact support.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: false,
      suggestedAction: "Provision Messaging Service in onboarding, then retry.",
    };
  }

  if (lower.includes("a2p") || lower.includes("campaign") || lower.includes("brand")) {
    return {
      userMessage:
        "A2P registration is not ready yet. Complete business profile and registration steps.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: false,
      suggestedAction: "Review A2P status in onboarding.",
    };
  }

  if (httpStatus === 429 || code === 20429) {
    return {
      userMessage: "Twilio is temporarily busy. Please wait a moment and try again.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: true,
      suggestedAction: "Retry in a few seconds.",
    };
  }

  if (httpStatus != null && httpStatus >= 500) {
    return {
      userMessage: "Twilio had a temporary error. Please try again shortly.",
      adminDetail: message,
      twilioCode: code,
      httpStatus,
      retryable: true,
      suggestedAction: "Retry the action.",
    };
  }

  return {
    userMessage:
      "Something went wrong with the phone provider. If this continues, contact support.",
    adminDetail: message,
    twilioCode: code,
    httpStatus,
    retryable: isRetryableTwilioError(error),
    suggestedAction: "Retry or check Twilio Console for the subaccount.",
  };
}

export function twilioErrorUserMessage(error: unknown): string {
  return presentTwilioError(error).userMessage;
}

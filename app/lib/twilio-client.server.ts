import type Twilio from "twilio";
import type { TollfreeVerificationListInstanceCreateOptions } from "twilio/lib/rest/messaging/v1/tollfreeVerification";
import type { BrandRegistrationListInstanceCreateOptions } from "twilio/lib/rest/messaging/v1/brandRegistration";
import type { UsAppToPersonListInstanceCreateOptions } from "twilio/lib/rest/messaging/v1/service/usAppToPerson";
import type { TrustProductsListInstanceCreateOptions } from "twilio/lib/rest/trusthub/v1/trustProducts";
import type { SinkListInstanceCreateOptions } from "twilio/lib/rest/events/v1/sink";
import type { SubscriptionListInstanceCreateOptions } from "twilio/lib/rest/events/v1/subscription";

import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
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

export type TrustHubCustomerProfileCreateInput = {
  friendlyName: string;
  email: string;
  policySid: string;
  statusCallback?: string;
};

/**
 * Create a Trust Hub Customer Profile bundle (secondary customer profile). The
 * Trust Hub REST surface is accessed defensively (`(twilio as any).trusthub`)
 * because the typed SDK shape lags the API; the call is still retried for
 * transient failures via `withTwilioRetry`.
 */
export async function createTrustHubCustomerProfile(
  twilio: Twilio.Twilio,
  input: TrustHubCustomerProfileCreateInput,
  options: TwilioClientCallOptions,
): Promise<{ sid: string | null; status: string | null }> {
  return withTwilioRetry(async () => {
    const trusthub = (twilio as unknown as {
      trusthub?: {
        v1?: {
          customerProfiles?: {
            create: (params: Record<string, unknown>) => Promise<{
              sid?: string;
              status?: string;
            }>;
          };
        };
      };
    }).trusthub;
    const create = trusthub?.v1?.customerProfiles?.create;
    if (!create) {
      throw new Error("Twilio Trust Hub customerProfiles API is unavailable");
    }
    const bundle = await create({
      friendlyName: input.friendlyName,
      email: input.email,
      policySid: input.policySid,
      ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}),
    });
    return {
      sid: typeof bundle?.sid === "string" ? bundle.sid : null,
      status: typeof bundle?.status === "string" ? bundle.status : null,
    };
  }, options);
}

/**
 * Attach an already-approved channel sender (e.g. an RCS sender created in Twilio
 * Console, SID prefix `XE`) to a Messaging Service's sender pool. Twilio does not
 * offer a public API to create RCS senders, but attaching an approved sender to a
 * Messaging Service's pool is a documented (Public Beta) `ChannelSenders` REST
 * resource: https://www.twilio.com/docs/messaging/api/messaging-service-channelsender-resource
 */
export async function attachChannelSenderToMessagingService(
  twilio: Twilio.Twilio,
  serviceSid: string,
  channelSenderSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.messaging.v1.services(serviceSid).channelSenders.create({
        sid: channelSenderSid,
      }),
    options,
  );
}

export async function listMessagingServiceChannelSenders(
  twilio: Twilio.Twilio,
  serviceSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.services(serviceSid).channelSenders.list({ limit: 200 }),
    options,
  );
}

// ─── Toll-Free Verification (Phase C) ───────────────────────────────────────

export type TollFreeVerificationCreateInput =
  TollfreeVerificationListInstanceCreateOptions;

/**
 * Submit a Toll-Free Verification (TFV) for a toll-free number. Wraps
 * `messaging.v1.tollfreeVerifications.create` with transient-failure retry.
 */
export async function createTollFreeVerification(
  twilio: Twilio.Twilio,
  input: TollFreeVerificationCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.tollfreeVerifications.create(input),
    options,
  );
}

export async function fetchTollFreeVerification(
  twilio: Twilio.Twilio,
  verificationSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.tollfreeVerifications(verificationSid).fetch(),
    options,
  );
}

/**
 * List existing Toll-Free Verifications, optionally filtered by the toll-free
 * phone number SID. Used for idempotency (skip re-submitting a number that
 * already has a verification record).
 */
export async function listTollFreeVerifications(
  twilio: Twilio.Twilio,
  params: { tollfreePhoneNumberSid?: string; limit?: number },
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.messaging.v1.tollfreeVerifications.list({
        limit: params.limit ?? 200,
        ...(params.tollfreePhoneNumberSid
          ? { tollfreePhoneNumberSid: params.tollfreePhoneNumberSid }
          : {}),
      }),
    options,
  );
}

// ─── A2P 10DLC: Trust Product → Brand → Campaign (Phase D) ───────────────────

export type A2pTrustProductCreateInput = TrustProductsListInstanceCreateOptions;

/**
 * Create an A2P Messaging "Trust Product" bundle (a2PProfileBundle). This is the
 * TrustHub bundle the brand registration references as its `a2PProfileBundleSid`.
 */
export async function createA2pTrustProduct(
  twilio: Twilio.Twilio,
  input: A2pTrustProductCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.trusthub.v1.trustProducts.create(input),
    options,
  );
}

export async function fetchA2pTrustProduct(
  twilio: Twilio.Twilio,
  trustProductSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.trusthub.v1.trustProducts(trustProductSid).fetch(),
    options,
  );
}

/**
 * Attach an object (e.g. the Secondary Customer Profile bundle) to a Trust
 * Product as an entity assignment. Idempotent at the caller: Twilio returns the
 * existing assignment if the object is already attached.
 */
export async function assignA2pTrustProductEntity(
  twilio: Twilio.Twilio,
  trustProductSid: string,
  objectSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.trusthub.v1
        .trustProducts(trustProductSid)
        .trustProductsEntityAssignments.create({ objectSid }),
    options,
  );
}

/** List entity assignments already attached to a Trust Product. */
export async function listA2pTrustProductEntities(
  twilio: Twilio.Twilio,
  trustProductSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.trusthub.v1
        .trustProducts(trustProductSid)
        .trustProductsEntityAssignments.list({ limit: 200 }),
    options,
  );
}

/** Submit a Trust Product for review (transition its status to `submitted`). */
export async function submitA2pTrustProduct(
  twilio: Twilio.Twilio,
  trustProductSid: string,
  options: TwilioClientCallOptions,
  statusCallback?: string,
) {
  return withTwilioRetry(
    () =>
      twilio.trusthub.v1.trustProducts(trustProductSid).update({
        status: "pending-review",
        ...(statusCallback ? { statusCallback } : {}),
      }),
    options,
  );
}

export type A2pBrandRegistrationCreateInput =
  BrandRegistrationListInstanceCreateOptions;

export async function createA2pBrandRegistration(
  twilio: Twilio.Twilio,
  input: A2pBrandRegistrationCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.brandRegistrations.create(input),
    options,
  );
}

export async function fetchA2pBrandRegistration(
  twilio: Twilio.Twilio,
  brandSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.messaging.v1.brandRegistrations(brandSid).fetch(),
    options,
  );
}

export type A2pCampaignCreateInput = UsAppToPersonListInstanceCreateOptions;

/**
 * Create an A2P Campaign (US_APP_TO_PERSON) under a Messaging Service. The
 * campaign is scoped to the service's sender pool.
 */
export async function createA2pCampaign(
  twilio: Twilio.Twilio,
  serviceSid: string,
  input: A2pCampaignCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.messaging.v1.services(serviceSid).usAppToPerson.create(input),
    options,
  );
}

export async function listA2pCampaigns(
  twilio: Twilio.Twilio,
  serviceSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () =>
      twilio.messaging.v1.services(serviceSid).usAppToPerson.list({ limit: 200 }),
    options,
  );
}

// ─── Event Streams: Sinks + Subscriptions (Phase D) ─────────────────────────

export type EventStreamsSinkCreateInput = SinkListInstanceCreateOptions;
export type EventStreamsSubscriptionCreateInput =
  SubscriptionListInstanceCreateOptions;

export async function createEventStreamsSink(
  twilio: Twilio.Twilio,
  input: EventStreamsSinkCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(() => twilio.events.v1.sinks.create(input), options);
}

export async function listEventStreamsSinks(
  twilio: Twilio.Twilio,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.events.v1.sinks.list({ limit: 200 }),
    options,
  );
}

export async function fetchEventStreamsSink(
  twilio: Twilio.Twilio,
  sinkSid: string,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.events.v1.sinks(sinkSid).fetch(),
    options,
  );
}

export async function createEventStreamsSubscription(
  twilio: Twilio.Twilio,
  input: EventStreamsSubscriptionCreateInput,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.events.v1.subscriptions.create(input),
    options,
  );
}

export async function listEventStreamsSubscriptions(
  twilio: Twilio.Twilio,
  options: TwilioClientCallOptions,
) {
  return withTwilioRetry(
    () => twilio.events.v1.subscriptions.list({ limit: 200 }),
    options,
  );
}

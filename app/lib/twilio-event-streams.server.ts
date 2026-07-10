/**
 * Twilio Event Streams provisioning (Phase D).
 *
 * Creates (idempotently) a webhook Sink pointing at the A2P event receiver route
 * (`${BASE_URL}/api/twilio/a2p/events`, built by Phase B) and a Subscription for
 * A2P brand/campaign lifecycle events on the workspace subaccount. This lets
 * Twilio push brand/campaign status transitions to us instead of relying purely
 * on polling (`twilio-a2p-status-sync.server.ts`).
 *
 * Called from `provisionA2pRegistration`.
 */

import type Twilio from "twilio";

import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import {
  createEventStreamsSink,
  createEventStreamsSubscription,
  listEventStreamsSinks,
  listEventStreamsSubscriptions,
} from "@/lib/twilio-client.server";

const SINK_DESCRIPTION = "CallCaster A2P compliance events";
const SUBSCRIPTION_DESCRIPTION = "CallCaster A2P brand/campaign lifecycle";

/**
 * A2P brand + campaign lifecycle Event Types.
 *
 * TODO(twilio-event-types): confirm these type strings + schema versions against
 * the live Event Types API (`twilio.events.v1.eventTypes.list()`), which can
 * drift. Unknown/invalid type strings cause the Subscription create to 400, so
 * they are isolated here for a single point of correction.
 */
const A2P_EVENT_TYPES: Array<{ type: string; schema_version: number }> = [
  {
    type: "com.twilio.messaging.compliance.brand-registration.brand-registered",
    schema_version: 1,
  },
  {
    type: "com.twilio.messaging.compliance.brand-registration.brand-unregistered",
    schema_version: 1,
  },
  {
    type: "com.twilio.messaging.compliance.brand-registration.brand-failure",
    schema_version: 1,
  },
  {
    type: "com.twilio.messaging.compliance.campaign-registration.campaign-approved",
    schema_version: 1,
  },
  {
    type: "com.twilio.messaging.compliance.campaign-registration.campaign-failure",
    schema_version: 1,
  },
];

function eventReceiverUrl(): string {
  return `${env.BASE_URL()}/api/twilio/a2p/events`;
}

function sinkDestination(sink: {
  sinkConfiguration?: unknown;
}): string | null {
  const config = sink.sinkConfiguration;
  if (config && typeof config === "object" && "destination" in config) {
    const dest = (config as { destination?: unknown }).destination;
    return typeof dest === "string" ? dest : null;
  }
  return null;
}

/**
 * Idempotently ensure a webhook Sink + Subscription for A2P lifecycle events on
 * the workspace subaccount. Best-effort: failures are logged and surfaced via
 * the returned `error` rather than thrown, so A2P registration is not blocked by
 * an Event Streams hiccup (polling remains the fallback).
 */
export async function ensureA2pEventStreamsSink(args: {
  workspaceId: string;
  twilio: Twilio.Twilio;
}): Promise<{
  sinkSid: string | null;
  subscriptionSid: string | null;
  status: string | null;
  error: string | null;
}> {
  const { workspaceId, twilio } = args;
  const destination = eventReceiverUrl();

  let sinkSid: string | null = null;
  let sinkStatus: string | null = null;

  try {
    // 1. Reuse an existing webhook sink pointing at our receiver, else create.
    const existingSinks = await listEventStreamsSinks(twilio, {
      workspaceId,
      operation: "events.sinks.list",
    });
    const reusable = existingSinks.find(
      (sink) =>
        sink.sinkType === "webhook" && sinkDestination(sink) === destination,
    );

    if (reusable) {
      sinkSid = reusable.sid;
      sinkStatus = reusable.status;
    } else {
      const sink = await createEventStreamsSink(
        twilio,
        {
          description: SINK_DESCRIPTION,
          sinkType: "webhook",
          sinkConfiguration: {
            destination,
            method: "POST",
            batch_events: false,
          },
        },
        { workspaceId, operation: "events.sinks.create" },
      );
      sinkSid = sink.sid;
      sinkStatus = sink.status;
      logger.info("twilio.compliance.a2p.event_sink_created", {
        workspaceId,
        sinkSid,
        status: sinkStatus,
      });
    }
  } catch (error) {
    const detail = presentTwilioError(error).adminDetail;
    logger.error("twilio.compliance.a2p.event_sink_failed", {
      workspaceId,
      error: detail,
    });
    return { sinkSid: null, subscriptionSid: null, status: null, error: detail };
  }

  if (!sinkSid) {
    return {
      sinkSid: null,
      subscriptionSid: null,
      status: null,
      error: "Event Streams sink SID was not returned",
    };
  }

  // NOTE: A webhook Sink starts in `initialized` and must complete Twilio's
  // validation handshake (a test event echoed back by the receiver route) before
  // it becomes `active`; a Subscription can only be created against an active
  // sink. Phase B's `/api/twilio/a2p/events` receiver is expected to answer that
  // handshake. If the sink is not yet active the Subscription create below will
  // 400 — we treat that as non-fatal and let a later run reconcile once active.
  let subscriptionSid: string | null = null;
  try {
    const existingSubs = await listEventStreamsSubscriptions(twilio, {
      workspaceId,
      operation: "events.subscriptions.list",
    });
    const reusableSub = existingSubs.find((sub) => sub.sinkSid === sinkSid);
    if (reusableSub) {
      subscriptionSid = reusableSub.sid;
    } else {
      const subscription = await createEventStreamsSubscription(
        twilio,
        {
          description: SUBSCRIPTION_DESCRIPTION,
          sinkSid,
          types: A2P_EVENT_TYPES,
        },
        { workspaceId, operation: "events.subscriptions.create" },
      );
      subscriptionSid = subscription.sid;
      logger.info("twilio.compliance.a2p.event_subscription_created", {
        workspaceId,
        sinkSid,
        subscriptionSid,
      });
    }
  } catch (error) {
    const detail = presentTwilioError(error).adminDetail;
    logger.warn("twilio.compliance.a2p.event_subscription_deferred", {
      workspaceId,
      sinkSid,
      sinkStatus,
      error: detail,
    });
    return {
      sinkSid,
      subscriptionSid: null,
      status: sinkStatus,
      error: detail,
    };
  }

  return { sinkSid, subscriptionSid, status: sinkStatus, error: null };
}

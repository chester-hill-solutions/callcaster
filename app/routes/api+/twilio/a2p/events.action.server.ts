import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { logger } from "@/lib/logger.server";
import { syncWorkspaceA2pStatus } from "@/lib/twilio-a2p-status-sync.server";
import { findWorkspaceIdByComplianceSid } from "@/lib/twilio-compliance-webhook.server";

/**
 * A2P Event Streams sink receiver (`POST /api/twilio/a2p/events`).
 *
 * Twilio Event Streams delivers a JSON body (single CloudEvent or an array).
 * This receiver parses brand/campaign lifecycle events, resolves the owning
 * workspace by the brand/campaign SID, and reconciles onboarding status via
 * `syncWorkspaceA2pStatus`.
 *
 * NOTE: sink creation/subscription and sink-secret validation are Phase D. This
 * route is signature-agnostic because Event Streams JSON bodies are not
 * form-encoded and use a different auth model than `requireTwilioSignature`.
 */

type EventStreamEvent = {
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

function toEventArray(body: unknown): EventStreamEvent[] {
  if (Array.isArray(body)) return body as EventStreamEvent[];
  if (body && typeof body === "object") return [body as EventStreamEvent];
  return [];
}

function readSid(event: EventStreamEvent): string | null {
  const data = (event.data ?? event) as Record<string, unknown>;
  for (const key of [
    "brand_sid",
    "brandSid",
    "campaign_sid",
    "campaignSid",
    "BrandSid",
    "CampaignSid",
    "sid",
    "Sid",
  ]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return routeData({ error: "Expected JSON body" }, { status: 400 });
    }

    const events = toEventArray(body);
    const resolved = new Set<string>();

    for (const event of events) {
      const sid = readSid(event);
      if (!sid) continue;
      const workspaceId = await findWorkspaceIdByComplianceSid(sid);
      if (!workspaceId) {
        logger.warn("twilio.compliance.a2p.events.unresolved", {
          sid,
          type: event.type ?? null,
        });
        continue;
      }
      if (resolved.has(workspaceId)) continue;
      resolved.add(workspaceId);
      // Poll fallback: reconcile authoritative brand/campaign status from Twilio.
      await syncWorkspaceA2pStatus({ workspaceId, actorUserId: null });
      logger.info("twilio.compliance.a2p.events", {
        workspaceId,
        sid,
        type: event.type ?? null,
      });
    }

    return routeData({ ok: true, updated: resolved.size });
  } catch (error) {
    logger.error("twilio.compliance.a2p.events.error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return routeData({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { syncWorkspaceA2pStatus } from "@/lib/twilio-a2p-status-sync.server";
import {
  findWorkspaceIdByComplianceSid,
  pickWebhookField,
} from "@/lib/twilio-compliance-webhook.server";

/**
 * Trust Hub `status_callback` receiver (`POST /api/twilio/trusthub/status`).
 *
 * Validates the Twilio signature, resolves the workspace by the customer-profile
 * bundle SID carried in the callback, and reconciles onboarding compliance
 * status by polling Twilio via `syncWorkspaceA2pStatus`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const formData = await request.clone().formData();
    const payload = Object.fromEntries(formData.entries()) as Record<
      string,
      string
    >;

    const bundleSid = pickWebhookField(payload, [
      "BundleSid",
      "CustomerProfileSid",
      "Sid",
      "ResourceSid",
    ]);
    const status = pickWebhookField(payload, ["Status", "BundleStatus"]);

    const workspaceId = bundleSid
      ? await findWorkspaceIdByComplianceSid(bundleSid)
      : null;

    // Validate against the resolving workspace's subaccount token when known;
    // otherwise fall back to main-account validation.
    const forbidden = await requireTwilioSignature(
      request,
      workspaceId ? { workspaceId } : undefined,
    );
    if (forbidden) return forbidden;

    if (!workspaceId) {
      logger.warn("twilio.compliance.trusthub.webhook.unresolved", {
        bundleSid,
        status,
      });
      // 200 so Twilio does not retry a callback we cannot attribute yet.
      return routeData({ ok: true, resolved: false });
    }

    // Poll fallback: reconcile authoritative status from Twilio.
    await syncWorkspaceA2pStatus({ workspaceId, actorUserId: null });

    logger.info("twilio.compliance.trusthub.webhook", {
      workspaceId,
      bundleSid,
      status,
    });
    return routeData({ ok: true, resolved: true });
  } catch (error) {
    logger.error("twilio.compliance.trusthub.webhook.error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return routeData({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

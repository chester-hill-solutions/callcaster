/**
 * Trust Hub Customer Profile provisioning (Phase B).
 *
 * Creates a Trust Hub Secondary Customer Profile bundle for a workspace on first
 * compliance opt-in (toll-free bulk SMS or A2P 10DLC). Idempotent: if a bundle
 * SID already exists in onboarding state it is returned unchanged.
 *
 * The resulting bundle SID is persisted onto the existing
 * `onboarding.a2p10dlc.customerProfileBundleSid` field (shared by both the
 * toll-free and A2P provisioning steps) so no new `types.ts` field is required.
 */

import { logger } from "@/lib/logger.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  loadWorkspaceTwilioData,
  persistWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import {
  createTrustHubCustomerProfile,
  createWorkspaceTwilioClient,
} from "@/lib/twilio-client.server";
import { env } from "@/lib/env.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import type { TwilioAccountData } from "@/lib/types";

/**
 * Twilio's global "secondary customer profile" Trust Hub policy SID. Overridable
 * via `TWILIO_TRUSTHUB_SECONDARY_POLICY_SID` for account/region differences.
 *
 * NOTE: confirm this default against the Twilio Console before go-live — Phases
 * C/D submit the bundle for review, at which point a wrong policy SID surfaces.
 */
const DEFAULT_SECONDARY_CUSTOMER_PROFILE_POLICY_SID =
  "RNdfbf3fXXXXXXXXXXXXXXXXXXXXXXXXXX";

function resolvePolicySid(): string {
  return (
    env.TWILIO_TRUSTHUB_SECONDARY_POLICY_SID() ||
    DEFAULT_SECONDARY_CUSTOMER_PROFILE_POLICY_SID
  );
}

export async function ensureTrustHubCustomerProfile(args: {
  workspaceId: string;
  actorUserId?: string | null;
}): Promise<{ customerProfileBundleSid: string; status: string }> {
  const { workspaceId, actorUserId = null } = args;

  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  // Idempotent: reuse an existing bundle SID if one is already provisioned.
  const existing = onboarding.a2p10dlc.customerProfileBundleSid;
  if (existing) {
    return { customerProfileBundleSid: existing, status: "existing" };
  }

  // Reuse the workspace's emergency/business address (Q17) + business profile.
  const address = onboarding.emergencyVoice.address;
  const email =
    onboarding.businessProfile.supportEmail.trim() ||
    env.TWILIO_COMPLIANCE_NOTIFY_EMAIL() ||
    "";
  const friendlyName =
    onboarding.businessProfile.legalBusinessName.trim() ||
    address.customerName.trim() ||
    `Workspace ${workspaceId} Customer Profile`;

  const twilio = await createWorkspaceTwilioClient({ workspaceId });

  let bundleSid: string | null = null;
  let bundleStatus = "draft";
  try {
    const bundle = await createTrustHubCustomerProfile(
      twilio,
      {
        friendlyName,
        email,
        policySid: resolvePolicySid(),
        statusCallback: `${env.BASE_URL()}/api/twilio/trusthub/status`,
      },
      { workspaceId, operation: "trusthub.customerProfiles.create" },
    );
    bundleSid = bundle.sid;
    bundleStatus = bundle.status ?? "draft";
  } catch (error) {
    logger.error("twilio.compliance.trusthub.create_failed", {
      workspaceId,
      error: presentTwilioError(error).adminDetail,
    });
    throw error;
  }

  if (!bundleSid) {
    throw new Error("Trust Hub customer profile bundle SID was not returned");
  }

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    a2p10dlc: {
      ...onboarding.a2p10dlc,
      customerProfileBundleSid: bundleSid,
      lastSyncedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });

  await persistWorkspaceTwilioData(workspaceId, {
    ...(twilioData as Record<string, unknown>),
    onboarding: nextOnboarding,
  });

  logger.info("twilio.compliance.trusthub.created", {
    workspaceId,
    customerProfileBundleSid: bundleSid,
    status: bundleStatus,
  });

  return { customerProfileBundleSid: bundleSid, status: bundleStatus };
}

import { logger } from "@/lib/logger.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { resolveA2pPolicySid } from "@/lib/a2p-messaging-profile.server";
import {
  createWorkspaceTwilioClient,
  fetchA2pTrustProduct,
} from "@/lib/twilio-client.server";
import type { TwilioAccountData, WorkspaceOnboardingStatus } from "@/lib/types";

function mapBrandStatus(raw: string | undefined): WorkspaceOnboardingStatus {
  const normalized = (raw ?? "").toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "failed" || normalized === "rejected") return "rejected";
  if (normalized === "in_review" || normalized === "pending") return "in_review";
  return "provisioning";
}

function mapCampaignStatus(raw: string | undefined): WorkspaceOnboardingStatus {
  const normalized = (raw ?? "").toUpperCase();
  if (normalized === "VERIFIED") return "approved";
  if (normalized === "IN_PROGRESS") return "in_review";
  return mapBrandStatus(raw);
}

/** One resource's contribution: what the provider said, and whether it exists. */
export type A2pResourceStatus = {
  /** `null` when the resource was not read. Never seeded from the aggregate. */
  fetched: WorkspaceOnboardingStatus | null;
  /** False when the workspace has no such resource at all. */
  exists: boolean;
};

/**
 * Approval requires authoritative approval for both required resources.
 * Absent and unread resources cannot establish a completed 10DLC registration.
 * A provider rejection takes precedence over waiting for the other resource.
 * Never seed a per-resource value from the stored aggregate (#2143).
 */
export function mergeA2pStatus(resources: {
  brand: A2pResourceStatus;
  campaign: A2pResourceStatus;
}): WorkspaceOnboardingStatus {
  const known = [resources.brand, resources.campaign]
    .map((resource) =>
      resource.exists ? (resource.fetched ?? "in_review") : null,
    )
    .filter((status): status is WorkspaceOnboardingStatus => status !== null);

  if (known.some((status) => status === "rejected")) return "rejected";
  if (
    resources.brand.exists && resources.campaign.exists &&
    known.every((status) => status === "approved")
  ) {
    return "approved";
  }
  return "in_review";
}

export async function syncWorkspaceA2pStatus({
  workspaceId,
  actorUserId,
}: {
  workspaceId: string;
  actorUserId: string | null;
}) {
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const brandSid = onboarding.a2p10dlc.brandSid;
  const campaignSid = onboarding.a2p10dlc.campaignSid;

  const trustProductSid = onboarding.a2p10dlc.trustProductSid;
  if (!brandSid && !campaignSid && !trustProductSid) {
    return onboarding;
  }

  const twilio = await createWorkspaceTwilioClient({
    workspaceId,
  });

  // Whether each resource was actually read is tracked separately from its
  // status. Seeding an unfetched resource from the stored aggregate is what made
  // this state monotonic: the aggregate could only ever be read back into itself,
  // so it could never move away from `approved` (#2143).
  let brandStatus: WorkspaceOnboardingStatus | null = null;
  let campaignStatus: WorkspaceOnboardingStatus | null = null;
  let rejectionReason = onboarding.a2p10dlc.rejectionReason;
  let productAccepted = false;
  let productError: string | null = null;
  if (trustProductSid) {
    try {
      const product = await fetchA2pTrustProduct(twilio, trustProductSid, {
        workspaceId,
        operation: "trusthub.trustProducts.fetch",
      });
      productAccepted =
        product.sid === trustProductSid &&
        product.policySid === resolveA2pPolicySid() &&
        ["pending-review", "in-review", "twilio-approved"].includes(
          product.status,
        );
      if (!productAccepted)
        productError =
          "A2P Messaging Profile is not accepted for review. Correct its business information and retry preparation.";
    } catch (error) {
      logger.error("A2P Messaging Profile status read failed:", error);
      productError =
        "A2P Messaging Profile status could not be verified. Retry preparation before sending.";
    }
  }

  try {
    if (brandSid) {
      const brand = await twilio.messaging.v1.brandRegistrations(brandSid).fetch();
      brandStatus = mapBrandStatus(brand.status);
      if (brand.failureReason) {
        rejectionReason = String(brand.failureReason);
      }
    }
    if (campaignSid) {
      const serviceSid = onboarding.messagingService.serviceSid ?? "";
      const campaign = await twilio.messaging.v1
        .services(serviceSid)
        .usAppToPerson(campaignSid)
        .fetch();
      campaignStatus = mapCampaignStatus(campaign.campaignStatus);
    }
  } catch (syncError) {
    logger.error("A2P status sync failed:", syncError);
    // Only a partial read is a problem worth reporting; the stored state stands
    // either way, so the return below is shared.
  }

  if (brandStatus === null && campaignStatus === null && !trustProductSid) {
    // Nothing authoritative was read. Leave the state exactly as it is rather
    // than guessing: guessing conservatively would close a live workspace's
    // send gate on a transient network error, and no write means `lastSyncedAt`
    // is not bumped either, so the record does not look freshly verified.
    return onboarding;
  }

  const resourceStatus = mergeA2pStatus({
    brand: { fetched: brandStatus, exists: Boolean(brandSid) },
    campaign: { fetched: campaignStatus, exists: Boolean(campaignSid) },
  });

  let nextOnboarding = onboarding;
  await mergeWorkspaceTwilioData(workspaceId, (current) => {
    const fresh = getWorkspaceMessagingOnboardingFromTwilioData(current);
    nextOnboarding = fresh;
    if (
      fresh.a2p10dlc.brandSid !== brandSid ||
      fresh.a2p10dlc.campaignSid !== campaignSid ||
      fresh.a2p10dlc.trustProductSid !== trustProductSid ||
      fresh.messagingService.serviceSid !==
        onboarding.messagingService.serviceSid
    )
      return current;
    const preparation = productError
      ? "action_needed"
      : fresh.a2p10dlc.messagingProfileStatus;
    const mergedStatus =
      preparation === "ready" && productAccepted
        ? resourceStatus
        : preparation === "action_needed"
          ? "rejected"
          : "in_review";
    nextOnboarding = mergeWorkspaceMessagingOnboardingState(fresh, {
      a2p10dlc: {
        messagingProfileStatus: preparation,
        status: mergedStatus,
        rejectionReason:
          productError ??
          (preparation === "action_needed"
            ? fresh.a2p10dlc.rejectionReason
            : rejectionReason),
        lastSyncedAt: new Date().toISOString(),
      },
      ...(productError
        ? {
            reviewState: {
              ...fresh.reviewState,
              lastError: productError,
              blockingIssues: [
                ...new Set([...fresh.reviewState.blockingIssues, productError]),
              ],
            },
          }
        : {}),
      lastUpdatedBy: actorUserId,
    });
    return { ...current, onboarding: nextOnboarding };
  });

  return nextOnboarding;
}

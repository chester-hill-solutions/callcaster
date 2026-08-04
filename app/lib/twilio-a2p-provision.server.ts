/**
 * A2P 10DLC registration provisioning (Phase D).
 *
 * Chains the A2P registration off the Trust Hub Secondary Customer Profile
 * (`args.customerProfileBundleSid`, created upstream by
 * `ensureTrustHubCustomerProfile`):
 *
 *   Trust Product (A2P Messaging Profile bundle)
 *     → Brand Registration (STANDARD / low-volume)
 *       → A2P Campaign (US_APP_TO_PERSON, under the Messaging Service)
 *
 * The resulting `trustProductSid` / `brandSid` / `campaignSid` are persisted onto
 * the existing `onboarding.a2p10dlc.*` fields. Also (best-effort) provisions an
 * Event Streams sink so Twilio pushes brand/campaign lifecycle transitions to
 * `/api/twilio/a2p/events`. Idempotent at every step.
 *
 * KEEP THE EXPORTED SIGNATURE STABLE — `twilio-compliance-job.server.ts` (Phase
 * B) depends on it.
 */

import type {
  ComplianceStepArgs,
  ComplianceStepResult,
  ComplianceStepStatus,
} from "@/lib/twilio-compliance-types";
import { logger } from "@/lib/logger.server";
import { env } from "@/lib/env.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import {
  assignA2pTrustProductEntity,
  createA2pBrandRegistration,
  createA2pCampaign,
  createA2pTrustProduct,
  createWorkspaceTwilioClient,
  fetchA2pBrandRegistration,
  listA2pCampaigns,
  listA2pTrustProductEntities,
  submitA2pTrustProduct,
} from "@/lib/twilio-client.server";
import { ensureA2pEventStreamsSink } from "@/lib/twilio-event-streams.server";
import type {
  TwilioAccountData,
  WorkspaceA2POnboardingState,
  WorkspaceMessagingOnboardingState,
} from "@/lib/types";

/**
 * Global Twilio "A2P Messaging" Trust Product policy SID. Overridable via
 * `TWILIO_A2P_MESSAGING_POLICY_SID`.
 *
 * TODO(a2p-policy-sid): confirm this default against the Twilio Console /
 * `trusthub.v1.policies.list()` before go-live — a wrong policy SID surfaces
 * when the trust product is submitted for review.
 */
const DEFAULT_A2P_MESSAGING_POLICY_SID = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

function resolveA2pPolicySid(): string {
  const override = process.env.TWILIO_A2P_MESSAGING_POLICY_SID;
  return override && override.trim() ? override.trim() : DEFAULT_A2P_MESSAGING_POLICY_SID;
}

function mapBrandStatus(raw: string | null | undefined): ComplianceStepStatus {
  const normalized = String(raw ?? "").toUpperCase();
  if (normalized === "APPROVED") return "approved";
  if (normalized === "FAILED" || normalized === "DELETED" || normalized.includes("REJECT")) {
    return "action_needed";
  }
  if (normalized === "IN_REVIEW" || normalized === "PENDING") return "in_review";
  return "pending";
}

function mapCampaignStatus(raw: string | null | undefined): ComplianceStepStatus {
  const normalized = String(raw ?? "").toUpperCase();
  if (normalized === "APPROVED" || normalized === "VERIFIED") return "approved";
  if (normalized === "FAILED" || normalized.includes("REJECT")) return "action_needed";
  if (
    normalized === "IN_REVIEW" ||
    normalized === "PENDING" ||
    normalized === "IN_PROGRESS"
  ) {
    return "in_review";
  }
  return "pending";
}

/** Defensive read of A2P-specific onboarding inputs the parallel onboarding
 * agent may add (EIN, use case, embedded-link flags). */
function readA2pInputs(onboarding: WorkspaceMessagingOnboardingState): {
  usAppToPersonUsecase: string;
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhone: boolean;
} {
  const a2p = onboarding.a2p10dlc as unknown as Record<string, unknown>;
  const usAppToPersonUsecase =
    typeof a2p.usAppToPersonUsecase === "string" && a2p.usAppToPersonUsecase.trim()
      ? (a2p.usAppToPersonUsecase as string).trim()
      : "LOW_VOLUME";
  return {
    usAppToPersonUsecase,
    hasEmbeddedLinks: a2p.hasEmbeddedLinks === true,
    hasEmbeddedPhone: a2p.hasEmbeddedPhone === true,
  };
}

async function persistA2pSids(
  workspaceId: string,
  actorUserId: string | null,
  current: WorkspaceA2POnboardingState,
  patch: Partial<WorkspaceA2POnboardingState>,
): Promise<void> {
  await updateWorkspaceMessagingOnboardingState({
    workspaceId,
    actorUserId,
    updates: {
      a2p10dlc: {
        ...current,
        ...patch,
        lastSyncedAt: new Date().toISOString(),
      },
    },
  });
}

export async function provisionA2pRegistration(
  args: ComplianceStepArgs,
): Promise<ComplianceStepResult> {
  const { workspaceId, actorUserId, customerProfileBundleSid, reason } = args;

  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  let a2p = onboarding.a2p10dlc;

  const serviceSid = onboarding.messagingService.serviceSid;
  if (!serviceSid) {
    return {
      status: "action_needed",
      blockingIssues: [
        "Messaging Service is not provisioned; cannot register an A2P campaign.",
      ],
    };
  }

  const twilio = await createWorkspaceTwilioClient({ workspaceId });
  const policySid = resolveA2pPolicySid();
  const email =
    onboarding.businessProfile.supportEmail.trim() ||
    env.TWILIO_COMPLIANCE_NOTIFY_EMAIL() ||
    "";
  const statusCallback = `${env.BASE_URL()}/api/twilio/trusthub/status`;

  logger.info("twilio.compliance.a2p.provision.start", {
    workspaceId,
    customerProfileBundleSid,
    reason: reason ?? null,
    hasTrustProduct: Boolean(a2p.trustProductSid),
    hasBrand: Boolean(a2p.brandSid),
    hasCampaign: Boolean(a2p.campaignSid),
  });

  // ── 1. A2P Messaging Trust Product (a2PProfileBundle) ──────────────────────
  let trustProductSid = a2p.trustProductSid;
  if (!trustProductSid) {
    const trustProduct = await createA2pTrustProduct(
      twilio,
      {
        friendlyName:
          onboarding.businessProfile.legalBusinessName.trim() ||
          `Workspace ${workspaceId} A2P Profile`,
        email,
        policySid,
        statusCallback,
      },
      { workspaceId, operation: "trusthub.trustProducts.create" },
    );
    trustProductSid = trustProduct.sid ?? null;
    if (!trustProductSid) {
      throw new Error("A2P Trust Product SID was not returned");
    }

    // Attach the Secondary Customer Profile bundle to the trust product.
    await assignA2pTrustProductEntity(
      twilio,
      trustProductSid,
      customerProfileBundleSid,
      { workspaceId, operation: "trusthub.trustProducts.entityAssignments.create" },
    );

    // TODO(a2p-trust-product-entities): a real A2P Messaging Profile typically
    // also requires an `us_a2p_messaging_profile_information` end-user (company
    // type, stock exchange/ticker or EIN-backed attributes) assigned before the
    // trust product will pass evaluation. The onboarding agent captures those
    // fields; wire the corresponding end-user creation + assignment here once the
    // field shapes land. Submitting without them yields a review rejection that
    // surfaces via the status webhook/poll.

    await submitA2pTrustProduct(
      twilio,
      trustProductSid,
      { workspaceId, operation: "trusthub.trustProducts.submit" },
      statusCallback,
    ).catch((error) => {
      // Submission may fail if required entities are missing — log, don't abort:
      // the SID is persisted so a later run can resubmit.
      logger.warn("twilio.compliance.a2p.trust_product_submit_failed", {
        workspaceId,
        trustProductSid,
        error: presentTwilioError(error).adminDetail,
      });
    });

    await persistA2pSids(workspaceId, actorUserId, a2p, { trustProductSid });
    a2p = { ...a2p, trustProductSid };
  } else {
    // Idempotent re-run: make sure the customer profile is assigned.
    try {
      const entities = await listA2pTrustProductEntities(twilio, trustProductSid, {
        workspaceId,
        operation: "trusthub.trustProducts.entityAssignments.list",
      });
      const assigned = entities.some(
        (e) => (e as { objectSid?: string }).objectSid === customerProfileBundleSid,
      );
      if (!assigned) {
        await assignA2pTrustProductEntity(
          twilio,
          trustProductSid,
          customerProfileBundleSid,
          {
            workspaceId,
            operation: "trusthub.trustProducts.entityAssignments.create",
          },
        );
      }
    } catch (error) {
      logger.warn("twilio.compliance.a2p.trust_product_entity_check_failed", {
        workspaceId,
        trustProductSid,
        error: presentTwilioError(error).adminDetail,
      });
    }
  }

  // ── 2. Brand Registration ──────────────────────────────────────────────────
  let brandSid = a2p.brandSid;
  let brandRawStatus: string | null = null;
  let brandFailureReason: string | null = null;

  if (!brandSid) {
    // NOTE: `brandType` accepts "STANDARD" | "SOLE_PROPRIETOR". LOW_VOLUME_STANDARD
    // is a Twilio/TCR-assigned brand *tier* (based on vetting/volume), not a
    // create-time field — we register a STANDARD brand and Twilio classifies it
    // as low-volume automatically for low message volumes.
    const brand = await createA2pBrandRegistration(
      twilio,
      {
        customerProfileBundleSid,
        a2PProfileBundleSid: trustProductSid,
        brandType: "STANDARD",
      },
      { workspaceId, operation: "messaging.brandRegistrations.create" },
    );
    brandSid = brand.sid ?? null;
    brandRawStatus = brand.status ?? null;
    brandFailureReason =
      typeof brand.failureReason === "string" ? brand.failureReason : null;
    if (!brandSid) {
      throw new Error("A2P Brand Registration SID was not returned");
    }
    await persistA2pSids(workspaceId, actorUserId, a2p, {
      brandSid,
      brandType: "STANDARD",
      lastSubmittedAt: new Date().toISOString(),
    });
    a2p = { ...a2p, brandSid, brandType: "STANDARD" };
    logger.info("twilio.compliance.a2p.brand_created", {
      workspaceId,
      brandSid,
      status: brandRawStatus,
    });
  } else {
    const brand = await fetchA2pBrandRegistration(twilio, brandSid, {
      workspaceId,
      operation: "messaging.brandRegistrations.fetch",
    });
    brandRawStatus = brand.status ?? null;
    brandFailureReason =
      typeof brand.failureReason === "string" ? brand.failureReason : null;
  }

  // Best-effort Event Streams sink so brand/campaign transitions get pushed to us.
  await ensureA2pEventStreamsSink({ workspaceId, twilio }).catch((error) => {
    logger.warn("twilio.compliance.a2p.event_streams_failed", {
      workspaceId,
      error: presentTwilioError(error).adminDetail,
    });
  });

  const brandStatus = mapBrandStatus(brandRawStatus);
  if (brandStatus === "action_needed") {
    return {
      status: "action_needed",
      blockingIssues: [
        brandFailureReason?.trim() ||
          "A2P brand registration failed. Review the business profile and resubmit.",
      ],
      details: buildDetails({ trustProductSid, brandSid, campaignSid: a2p.campaignSid, brandRawStatus }),
    };
  }
  if (brandStatus !== "approved") {
    // Brand still under review — a campaign cannot be created until it approves.
    return {
      status: "in_review",
      blockingIssues: [],
      details: buildDetails({ trustProductSid, brandSid, campaignSid: a2p.campaignSid, brandRawStatus }),
    };
  }

  // ── 3. A2P Campaign (US_APP_TO_PERSON) ─────────────────────────────────────
  let campaignSid = a2p.campaignSid;
  let campaignRawStatus: string | null = null;

  if (!campaignSid) {
    // Idempotency guard: reuse an existing campaign on the service if present.
    try {
      const existing = await listA2pCampaigns(twilio, serviceSid, {
        workspaceId,
        operation: "messaging.usAppToPerson.list",
      });
      const match = existing.find(
        (c) => (c as { brandRegistrationSid?: string }).brandRegistrationSid === brandSid,
      );
      if (match) {
        campaignSid = match.sid ?? null;
        campaignRawStatus = (match as { campaignStatus?: string }).campaignStatus ?? null;
      }
    } catch {
      // Non-fatal — fall through to create.
    }
  }

  if (!campaignSid) {
    const bp = onboarding.businessProfile;
    const inputs = readA2pInputs(onboarding);
    const description =
      bp.useCaseSummary.trim() ||
      `${bp.legalBusinessName.trim()} customer messaging`;
    const messageFlow =
      bp.optInWorkflow.trim() ||
      "Consumers opt in via a web form on our website and consent to receive messages.";
    const messageSamples = bp.sampleMessages.filter(
      (s) => typeof s === "string" && s.trim().length > 0,
    );

    const campaign = await createA2pCampaign(
      twilio,
      serviceSid,
      {
        brandRegistrationSid: brandSid,
        description,
        messageFlow,
        messageSamples,
        usAppToPersonUsecase: inputs.usAppToPersonUsecase,
        hasEmbeddedLinks: inputs.hasEmbeddedLinks,
        hasEmbeddedPhone: inputs.hasEmbeddedPhone,
        ...(bp.optInKeywords
          ? { optInKeywords: splitKeywords(bp.optInKeywords), optInMessage: bp.optInWorkflow.trim() || undefined }
          : {}),
        ...(bp.optOutKeywords
          ? { optOutKeywords: splitKeywords(bp.optOutKeywords) }
          : {}),
        ...(bp.helpKeywords ? { helpKeywords: splitKeywords(bp.helpKeywords) } : {}),
      },
      { workspaceId, operation: "messaging.usAppToPerson.create" },
    );
    campaignSid = campaign.sid ?? null;
    campaignRawStatus = campaign.campaignStatus ?? null;
    if (campaignSid) {
      await persistA2pSids(workspaceId, actorUserId, a2p, { campaignSid });
      a2p = { ...a2p, campaignSid };
    }
    logger.info("twilio.compliance.a2p.campaign_created", {
      workspaceId,
      campaignSid,
      status: campaignRawStatus,
    });
  } else if (!campaignRawStatus) {
    // Persisted campaign — refresh its status.
    try {
      const existing = await listA2pCampaigns(twilio, serviceSid, {
        workspaceId,
        operation: "messaging.usAppToPerson.list",
      });
      const match = existing.find((c) => c.sid === campaignSid);
      campaignRawStatus =
        (match as { campaignStatus?: string } | undefined)?.campaignStatus ?? null;
    } catch {
      // Non-fatal.
    }
  }

  const campaignStatus = mapCampaignStatus(campaignRawStatus);
  const details = buildDetails({
    trustProductSid,
    brandSid,
    campaignSid,
    brandRawStatus,
    campaignRawStatus,
  });

  if (campaignStatus === "action_needed") {
    return {
      status: "action_needed",
      blockingIssues: [
        "A2P campaign registration failed. Review the campaign details and resubmit.",
      ],
      details,
    };
  }
  if (brandStatus === "approved" && campaignStatus === "approved") {
    return { status: "approved", blockingIssues: [], details };
  }
  return { status: "in_review", blockingIssues: [], details };
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function buildDetails(input: {
  trustProductSid: string | null;
  brandSid: string | null;
  campaignSid: string | null;
  brandRawStatus?: string | null;
  campaignRawStatus?: string | null;
}): Record<string, unknown> {
  return {
    trustProductSid: input.trustProductSid ?? null,
    brandSid: input.brandSid ?? null,
    campaignSid: input.campaignSid ?? null,
    brandTwilioStatus: input.brandRawStatus ?? null,
    campaignTwilioStatus: input.campaignRawStatus ?? null,
  };
}

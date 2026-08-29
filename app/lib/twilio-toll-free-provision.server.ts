/**
 * Toll-free verification provisioning (Phase C).
 *
 * Submits a Toll-Free Verification (TFV) for the workspace's toll-free number
 * via `messaging.v1.tollfreeVerifications.create`, using the business / opt-in
 * fields captured during onboarding. Maps the live Twilio TFV status onto the
 * shared `ComplianceStepResult`. Idempotent: if a verification already exists
 * for the number it is fetched and its current status returned rather than
 * re-submitted.
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
import { getWorkspacePhoneNumbers } from "@/lib/database/workspace.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
} from "@/lib/messaging-onboarding.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import { classifyPhoneNumberSenderType } from "@/lib/twilio-sender-class.server";
import {
  createTollFreeVerification,
  createWorkspaceTwilioClient,
  fetchTollFreeVerification,
  listTollFreeVerifications,
} from "@/lib/twilio-client.server";
import type { TollFreeVerificationCreateInput } from "@/lib/twilio-client.server";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
} from "@/lib/types";

/**
 * Map a raw Twilio TFV status onto the step-scoped compliance status.
 * Twilio statuses: PENDING_REVIEW | IN_REVIEW | TWILIO_APPROVED | TWILIO_REJECTED.
 */
function mapTfvStatus(raw: string | null | undefined): ComplianceStepStatus {
  const normalized = String(raw ?? "").toUpperCase();
  if (normalized.includes("APPROVED")) return "approved";
  if (normalized.includes("REJECTED")) return "action_needed";
  if (normalized.includes("PENDING") || normalized.includes("REVIEW")) {
    return "in_review";
  }
  return "pending";
}

/** Best-effort defensive read of TFV-specific onboarding inputs. The parallel
 * onboarding agent may add a `tollFreeVerification` sub-object and/or extra
 * business-profile fields; we read them without requiring the type to exist. */
function readTfvInputs(onboarding: WorkspaceMessagingOnboardingState): {
  optInImageUrls: string[];
  messageVolume: string;
  useCaseCategories: string[];
  optInType: TollFreeVerificationCreateInput["optInType"];
  additionalInformation: string | undefined;
} {
  // type-cast justified: tollFreeVerification is added by onboarding agent, not in base type
  const tfv =
    (onboarding as unknown as { tollFreeVerification?: Record<string, unknown> })
      .tollFreeVerification ?? {};
  // type-cast justified: defensive read for dynamic properties added to businessProfile
  const bp = onboarding.businessProfile as unknown as Record<string, unknown>;

  const optInImageUrls = Array.isArray(tfv.optInImageUrls)
    ? (tfv.optInImageUrls as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      )
    : [];

  const messageVolume =
    typeof tfv.messageVolume === "string" && tfv.messageVolume.trim()
      ? tfv.messageVolume.trim()
      : "1,000";

  const useCaseCategories =
    Array.isArray(tfv.useCaseCategories) && tfv.useCaseCategories.length > 0
      ? (tfv.useCaseCategories as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : ["MIXED"];

  const optInTypeRaw = String(
    (tfv.optInType as string | undefined) ??
      onboarding.businessProfile.optInWorkflow ??
      "",
  ).toUpperCase();
  const optInType: TollFreeVerificationCreateInput["optInType"] =
    optInTypeRaw.includes("VERBAL")
      ? "VERBAL"
      : optInTypeRaw.includes("PAPER")
        ? "PAPER_FORM"
        : optInTypeRaw.includes("TEXT")
          ? "VIA_TEXT"
          : optInTypeRaw.includes("QR")
            ? "MOBILE_QR_CODE"
            : "WEB_FORM";

  const additionalInformation =
    typeof bp.doingBusinessAs === "string" && bp.doingBusinessAs.trim()
      ? `Doing business as: ${bp.doingBusinessAs.trim()}`
      : typeof tfv.additionalInformation === "string"
        ? (tfv.additionalInformation as string)
        : undefined;

  return {
    optInImageUrls,
    messageVolume,
    useCaseCategories,
    optInType,
    additionalInformation,
  };
}

/** Locate the workspace's toll-free number and its Twilio phone-number SID. */
async function findWorkspaceTollFreeNumber(workspaceId: string): Promise<{
  phoneNumber: string;
  phoneNumberSid: string | null;
} | null> {
  const { data } = await getWorkspacePhoneNumbers({ workspaceId });
  const numbers = data ?? [];
  const tollFree = numbers.find(
    (n) =>
      typeof n.phone_number === "string" &&
      classifyPhoneNumberSenderType(n.phone_number) === "toll_free",
  );
  if (!tollFree || !tollFree.phone_number) return null;
  return {
    phoneNumber: tollFree.phone_number,
    phoneNumberSid:
      typeof tollFree.twilio_phone_number_sid === "string"
        ? tollFree.twilio_phone_number_sid
        : null,
  };
}

export async function provisionTollFreeVerification(
  args: ComplianceStepArgs,
): Promise<ComplianceStepResult> {
  const { workspaceId, customerProfileBundleSid, reason } = args;

  // type-cast justified: loadWorkspaceTwilioData returns Record<string, unknown>, but always contains TwilioAccountData
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);

  const tollFree = await findWorkspaceTollFreeNumber(workspaceId);
  if (!tollFree) {
    return {
      status: "action_needed",
      blockingIssues: [
        "No toll-free number is provisioned for this workspace. Purchase a toll-free number before submitting toll-free verification.",
      ],
    };
  }
  if (!tollFree.phoneNumberSid) {
    return {
      status: "action_needed",
      blockingIssues: [
        `Toll-free number ${tollFree.phoneNumber} is missing its Twilio phone-number SID; cannot submit verification.`,
      ],
    };
  }

  const twilio = await createWorkspaceTwilioClient({ workspaceId });

  // Idempotency: if a verification already exists for this number, fetch and
  // return its current status instead of re-submitting.
  try {
    const existing = await listTollFreeVerifications(
      twilio,
      { tollfreePhoneNumberSid: tollFree.phoneNumberSid },
      { workspaceId, operation: "tollfreeVerifications.list" },
    );
    const match = existing.find(
      (v) => v.tollfreePhoneNumberSid === tollFree.phoneNumberSid,
    );
    if (match) {
      const fresh = await fetchTollFreeVerification(twilio, match.sid, {
        workspaceId,
        operation: "tollfreeVerifications.fetch",
      });
      return buildResult(fresh.status, fresh.sid, fresh.rejectionReason);
    }
  } catch (error) {
    // A list/fetch failure is non-fatal — fall through and attempt submission.
    logger.warn("twilio.compliance.toll_free.idempotency_check_failed", {
      workspaceId,
      error: presentTwilioError(error).adminDetail,
    });
  }

  const inputs = readTfvInputs(onboarding);
  const address = onboarding.emergencyVoice.address;
  const bp = onboarding.businessProfile;
  const notificationEmail =
    bp.supportEmail.trim() || env.TWILIO_COMPLIANCE_NOTIFY_EMAIL() || "";
  const [contactFirst, ...contactRest] = (
    address.customerName.trim() || bp.legalBusinessName.trim()
  ).split(/\s+/);

  const createInput: TollFreeVerificationCreateInput = {
    businessName: bp.legalBusinessName.trim(),
    businessWebsite: bp.websiteUrl.trim(),
    notificationEmail,
    useCaseCategories: inputs.useCaseCategories,
    useCaseSummary: bp.useCaseSummary.trim(),
    productionMessageSample: bp.sampleMessages[0] ?? bp.useCaseSummary.trim(),
    optInImageUrls: inputs.optInImageUrls,
    optInType: inputs.optInType,
    messageVolume: inputs.messageVolume,
    tollfreePhoneNumberSid: tollFree.phoneNumberSid,
    customerProfileSid: customerProfileBundleSid,
    businessStreetAddress: address.street || undefined,
    businessCity: address.city || undefined,
    businessStateProvinceRegion: address.region || undefined,
    businessPostalCode: address.postalCode || undefined,
    businessCountry: address.countryCode || undefined,
    businessContactFirstName: contactFirst || undefined,
    businessContactLastName: contactRest.join(" ") || undefined,
    businessContactEmail: notificationEmail || undefined,
    businessContactPhone: bp.supportPhone || undefined,
    // Echoed back on status retrieval; lets us correlate webhook/status polls.
    externalReferenceId: workspaceId,
    ...(inputs.additionalInformation
      ? { additionalInformation: inputs.additionalInformation }
      : {}),
  };

  logger.info("twilio.compliance.toll_free.submitting", {
    workspaceId,
    tollFreePhoneNumberSid: tollFree.phoneNumberSid,
    customerProfileBundleSid,
    reason: reason ?? null,
  });

  const created = await createTollFreeVerification(twilio, createInput, {
    workspaceId,
    operation: "tollfreeVerifications.create",
  });

  logger.info("twilio.compliance.toll_free.submitted", {
    workspaceId,
    verificationSid: created.sid,
    status: created.status,
  });

  return buildResult(created.status, created.sid, created.rejectionReason);
}

function buildResult(
  rawStatus: string | null | undefined,
  verificationSid: string | null | undefined,
  rejectionReason: string | null | undefined,
): ComplianceStepResult {
  const status = mapTfvStatus(rawStatus);
  const blockingIssues: string[] =
    status === "action_needed"
      ? [
          rejectionReason?.trim() ||
            "Toll-free verification was rejected by Twilio. Review the submission and resubmit.",
        ]
      : [];
  return {
    status,
    blockingIssues,
    details: {
      tollFreeVerificationSid: verificationSid ?? null,
      twilioStatus: rawStatus ?? null,
      rejectionReason: rejectionReason ?? null,
    },
  };
}

/**
 * Twilio compliance provisioning orchestrator (Phase B).
 *
 * Called by the `workspace_twilio_compliance` worker job. Ensures the Messaging
 * Service exists, creates a Trust Hub Customer Profile bundle on first opt-in,
 * and drives the toll-free / A2P provisioning steps (stubs in Phase B, fleshed
 * out by Phases C and D). Statuses are persisted onto existing onboarding-state
 * fields; terminal failures raise an internal ops alert and mark the workspace
 * "action needed by CallCaster support".
 */

import { logger } from "@/lib/logger.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  loadWorkspaceTwilioData,
  mergeWorkspaceTwilioData,
} from "@/lib/merge-workspace-twilio-data.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { ensureTrustHubCustomerProfile } from "@/lib/twilio-trusthub.server";
import { provisionTollFreeVerification } from "@/lib/twilio-toll-free-provision.server";
import { provisionA2pRegistration } from "@/lib/twilio-a2p-provision.server";
import { sendComplianceOpsAlert } from "@/lib/twilio-compliance-notify.server";
import {
  alertGeoReadinessBlocked,
  ensureVoiceGeoPermissions,
  preflightNumberPurchase,
} from "@/lib/twilio-geo-permissions.server";
import { presentTwilioError } from "@/lib/twilio-errors";
import type {
  ComplianceStepResult,
  ComplianceStepStatus,
} from "@/lib/twilio-compliance-types";
import { isTerminalComplianceFailure } from "@/lib/twilio-compliance-types";
import type {
  TwilioAccountData,
  WorkspaceMessagingOnboardingState,
  WorkspaceOnboardingStatus,
} from "@/lib/types";

const TOLL_FREE_BULK_SMS_CHANNEL = "toll_free_bulk_sms";
const ACTION_NEEDED_MESSAGE = "Action needed by CallCaster support.";

/** Map a step-scoped compliance status onto the onboarding-state status enum. */
function toOnboardingStatus(
  status: ComplianceStepStatus,
): WorkspaceOnboardingStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "in_review":
      return "in_review";
    case "rejected":
    case "action_needed":
      return "rejected";
    case "pending":
    default:
      return "submitting";
  }
}

function a2pApplies(onboarding: WorkspaceMessagingOnboardingState): boolean {
  if (!onboarding.selectedChannels.includes("a2p10dlc")) return false;
  const country = onboarding.operatingCountry;
  return country === "US" || country === "BOTH";
}

export async function runWorkspaceTwilioComplianceJob(args: {
  workspaceId: string;
  reason?: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { workspaceId, reason, actorUserId = null } = args;

  // 1. Ensure Messaging Service bootstrap (idempotent / no-op when already live).
  const bootstrap = await ensureWorkspaceTwilioBootstrap({
    workspaceId,
    actorUserId,
  });
  if (bootstrap.outcome === "failed" || !bootstrap.serviceSid) {
    await persistActionNeeded({
      workspaceId,
      actorUserId,
      blockingIssues: [ACTION_NEEDED_MESSAGE],
      lastError:
        bootstrap.lastError ??
        "Messaging Service bootstrap failed before compliance provisioning.",
    });
    await sendComplianceOpsAlert({
      workspaceId,
      reason: "job_failed",
      path: "job",
      errorDetail: bootstrap.lastError ?? "Messaging Service bootstrap failed.",
    });
    return;
  }

  const onboarding = await loadOnboarding(workspaceId);

  // Geo readiness (runbook §1 automated where Twilio allows). Runs on every
  // compliance pass — including voice-only workspaces that skip the channel
  // provisioning below — so admin_retry heals older subaccounts too. Issues
  // are alerted (rate-limited) but never block channel provisioning: voice
  // permissions and number purchase are orthogonal to Trust Hub review.
  const voiceGeo = await ensureVoiceGeoPermissions({ workspaceId });
  const numberPreflights = await preflightNumberPurchase({
    workspaceId,
    operatingCountry: onboarding.operatingCountry,
  });
  const geoIssues = [
    ...(voiceGeo.ok
      ? []
      : [`Voice geographic-permissions update failed: ${voiceGeo.error}`]),
    ...numberPreflights.flatMap((p) => (p.ok || !p.issue ? [] : [p.issue])),
  ];
  if (geoIssues.length > 0) {
    logger.warn("twilio.compliance.job.geo_blocked", {
      workspaceId,
      reason,
      geoIssues,
    });
    await alertGeoReadinessBlocked({ workspaceId, issues: geoIssues });
  }

  const runTollFree = (onboarding.selectedChannels as string[]).includes(
    TOLL_FREE_BULK_SMS_CHANNEL,
  );
  const runA2p = a2pApplies(onboarding);

  if (!runTollFree && !runA2p) {
    logger.info("twilio.compliance.job.noop", { workspaceId, reason });
    return;
  }

  const blockingIssues: string[] = [];
  let tollFreeResult: ComplianceStepResult | null = null;
  let a2pResult: ComplianceStepResult | null = null;
  let terminalError: string | null = null;

  // 2. Toll-free bulk SMS path.
  if (runTollFree) {
    try {
      const { customerProfileBundleSid } = await ensureTrustHubCustomerProfile({
        workspaceId,
        actorUserId,
      });
      tollFreeResult = await provisionTollFreeVerification({
        workspaceId,
        actorUserId,
        customerProfileBundleSid,
        reason,
      });
      if (tollFreeResult.blockingIssues.length > 0) {
        blockingIssues.push(...tollFreeResult.blockingIssues);
      }
    } catch (error) {
      terminalError = presentTwilioError(error).adminDetail;
      logger.error("twilio.compliance.job.toll_free_failed", {
        workspaceId,
        error: terminalError,
      });
      await sendComplianceOpsAlert({
        workspaceId,
        reason: "job_failed",
        path: TOLL_FREE_BULK_SMS_CHANNEL,
        errorDetail: terminalError,
      });
    }
  }

  // 3. A2P 10DLC path (US / BOTH only).
  if (runA2p) {
    try {
      const { customerProfileBundleSid } = await ensureTrustHubCustomerProfile({
        workspaceId,
        actorUserId,
      });
      a2pResult = await provisionA2pRegistration({
        workspaceId,
        actorUserId,
        customerProfileBundleSid,
        reason,
      });
      if (a2pResult.blockingIssues.length > 0) {
        blockingIssues.push(...a2pResult.blockingIssues);
      }
    } catch (error) {
      terminalError = presentTwilioError(error).adminDetail;
      logger.error("twilio.compliance.job.a2p_failed", {
        workspaceId,
        error: terminalError,
      });
      await sendComplianceOpsAlert({
        workspaceId,
        reason: "job_failed",
        path: "a2p10dlc",
        errorDetail: terminalError,
      });
    }
  }

  const tollFreeActionNeeded = tollFreeResult
    ? isTerminalComplianceFailure(tollFreeResult)
    : false;
  const a2pActionNeeded = a2pResult
    ? isTerminalComplianceFailure(a2pResult)
    : false;
  const actionNeeded =
    Boolean(terminalError) || tollFreeActionNeeded || a2pActionNeeded;

  // 4. Persist resulting statuses onto existing onboarding fields.
  const current = await loadOnboarding(workspaceId);
  const updates: Partial<WorkspaceMessagingOnboardingState> = {
    lastUpdatedBy: actorUserId,
  };

  if (a2pResult) {
    updates.a2p10dlc = {
      ...current.a2p10dlc,
      status: toOnboardingStatus(a2pResult.status),
      rejectionReason: a2pActionNeeded
        ? ACTION_NEEDED_MESSAGE
        : current.a2p10dlc.rejectionReason,
      lastSyncedAt: new Date().toISOString(),
      lastSubmittedAt:
        current.a2p10dlc.lastSubmittedAt ?? new Date().toISOString(),
    };
  }

  const allBlocking = actionNeeded
    ? Array.from(new Set([ACTION_NEEDED_MESSAGE, ...blockingIssues]))
    : blockingIssues;

  updates.reviewState = {
    ...current.reviewState,
    blockingIssues: allBlocking,
    lastError: terminalError ?? current.reviewState.lastError,
    lastUpdatedAt: new Date().toISOString(),
  };

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(current, updates);
  await persistOnboarding(workspaceId, nextOnboarding);

  // 5. Ops alert when a bundle needs docs / manual action.
  if (actionNeeded && !terminalError) {
    await sendComplianceOpsAlert({
      workspaceId,
      reason: "action_needed",
      path: a2pActionNeeded ? "a2p10dlc" : TOLL_FREE_BULK_SMS_CHANNEL,
      blockingIssues: allBlocking,
    });
  }

  logger.info("twilio.compliance.job.completed", {
    workspaceId,
    reason: reason ?? null,
    runTollFree,
    runA2p,
    tollFreeStatus: tollFreeResult?.status ?? null,
    a2pStatus: a2pResult?.status ?? null,
    actionNeeded,
  });
}

async function loadOnboarding(
  workspaceId: string,
): Promise<WorkspaceMessagingOnboardingState> {
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;
  return getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
}

async function persistOnboarding(
  workspaceId: string,
  onboarding: WorkspaceMessagingOnboardingState,
): Promise<void> {
  // Atomic merge preserves any top-level keys (brandSid/campaignSid/…) a
  // concurrent onboarding save may have written between our load and write.
  await mergeWorkspaceTwilioData(workspaceId, (current) => ({
    ...current,
    onboarding,
  }));
}

async function persistActionNeeded(args: {
  workspaceId: string;
  actorUserId: string | null;
  blockingIssues: string[];
  lastError: string;
}): Promise<void> {
  const current = await loadOnboarding(args.workspaceId);
  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(current, {
    reviewState: {
      ...current.reviewState,
      blockingIssues: Array.from(new Set(args.blockingIssues)),
      lastError: args.lastError,
      lastUpdatedAt: new Date().toISOString(),
    },
    lastUpdatedBy: args.actorUserId,
  });
  await persistOnboarding(args.workspaceId, nextOnboarding);
}

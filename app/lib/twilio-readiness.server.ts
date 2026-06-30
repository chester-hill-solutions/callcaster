import type { Database } from "@/lib/db-types";
import {
  deriveWorkspaceMessagingReadiness,
  evaluateWorkspaceReadinessByIds,
  getWorkspaceMessagingOnboardingState,
  predicatePassed,
  type WorkspaceReadinessContext,
} from "@/lib/messaging-onboarding.server";
import { verifyWorkspaceMessagingSenderPool } from "@/lib/twilio-sender-pool.server";
import {
  getWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
} from "@/lib/database.server";
import { loadWorkspaceTwilioData } from "@/lib/merge-workspace-twilio-data.server";
import type { TwilioAccountData } from "@/lib/types";

export class WorkspaceSmsNotReadyError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join(" "));
    this.name = "WorkspaceSmsNotReadyError";
    this.reasons = reasons;
  }
}

/**
 * Fail closed before outbound SMS when workspace Twilio messaging is not ready.
 *
 * Reuses `deriveWorkspaceMessagingReadiness` for the shared messaging/A2P predicates
 * (so UI readiness and the send gate cannot diverge), then projects the send-gate-only
 * predicates (sender pool, toll-free verification) over the same predicate table.
 */
export async function assertWorkspaceCanSendSms({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const twilioData = (await loadWorkspaceTwilioData(
    workspaceId,
  )) as unknown as TwilioAccountData;

  const [onboarding, portalConfig, senderPool] = await Promise.all([
    getWorkspaceMessagingOnboardingState({ workspaceId }),
    getWorkspaceTwilioPortalConfig({ workspaceId }),
    verifyWorkspaceMessagingSenderPool({ workspaceId }),
  ]);

  const syncSnapshot = getWorkspaceTwilioSyncSnapshotFromTwilioData(twilioData);

  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding,
    workspaceNumbers: [],
    recentOutboundCount: 0,
  });

  const ctx: WorkspaceReadinessContext = {
    onboarding,
    workspaceNumbers: [],
    recentOutboundCount: 0,
    senderPool,
    portalConfig: { sendMode: portalConfig.sendMode },
    syncSnapshot: { tollFreeVerificationBlocked: syncSnapshot.tollFreeVerificationBlocked },
  };

  const sendGateResults = evaluateWorkspaceReadinessByIds(ctx, [
    "sender_pool_in_sync",
    "sender_pool_has_senders",
    "toll_free_verified",
  ]);

  const reasons: string[] = [];

  if (!readiness.messagingReady) {
    reasons.push("Messaging Service has not been provisioned.");
  }

  if (!predicatePassed("a2p_approved", ctx)) {
    reasons.push("A2P 10DLC registration is not approved yet.");
  }

  for (const result of sendGateResults) {
    reasons.push(result.message);
  }

  if (reasons.length > 0) {
    throw new WorkspaceSmsNotReadyError(reasons);
  }
}

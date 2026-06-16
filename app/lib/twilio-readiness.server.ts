import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  getWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { verifyWorkspaceMessagingSenderPool } from "@/lib/twilio-sender-pool.server";
import {
  getWorkspaceTwilioPortalConfig,
  getWorkspaceTwilioSyncSnapshotFromTwilioData,
} from "@/lib/database.server";
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
 */
export async function assertWorkspaceCanSendSms({
  supabaseClient,
  workspaceId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
}): Promise<void> {
  const [onboarding, portalConfig, senderPool, workspaceRow] = await Promise.all([
    getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
    getWorkspaceTwilioPortalConfig({ supabaseClient, workspaceId }),
    verifyWorkspaceMessagingSenderPool({ supabaseClient, workspaceId }),
    supabaseClient
      .from("workspace")
      .select("twilio_data")
      .eq("id", workspaceId)
      .single(),
  ]);

  const syncSnapshot = getWorkspaceTwilioSyncSnapshotFromTwilioData(
    (workspaceRow.data?.twilio_data ?? null) as TwilioAccountData,
  );

  const reasons: string[] = [];

  if (!onboarding.messagingService.serviceSid) {
    reasons.push("Messaging Service has not been provisioned.");
  }

  const sendViaService =
    portalConfig.sendMode === "messaging_service" ||
    onboarding.messagingService.desiredSendMode === "messaging_service";

  if (sendViaService && !senderPool.inSync) {
    if (senderPool.missingFromPool.length > 0) {
      reasons.push(
        `Sender pool is missing numbers: ${senderPool.missingFromPool.join(", ")}.`,
      );
    }
    if (senderPool.livePhoneNumbers.length === 0) {
      reasons.push("Messaging Service has no senders in the Twilio sender pool.");
    }
  }

  if (
    onboarding.selectedChannels.includes("a2p10dlc") &&
    onboarding.a2p10dlc.status !== "approved" &&
    onboarding.a2p10dlc.status !== "live"
  ) {
    reasons.push("A2P 10DLC registration is not approved yet.");
  }

  if (syncSnapshot.tollFreeVerificationBlocked) {
    reasons.push(
      "Toll-free verification is pending or rejected. Bulk SMS is blocked until Twilio approves verification.",
    );
  }

  if (reasons.length > 0) {
    throw new WorkspaceSmsNotReadyError(reasons);
  }
}

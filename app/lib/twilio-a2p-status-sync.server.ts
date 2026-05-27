import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { logger } from "@/lib/logger.server";
import {
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { createWorkspaceTwilioClient } from "@/lib/twilio-client.server";
import type { TwilioAccountData } from "@/lib/types";
import { isRecord } from "@/lib/parse-utils.server";

function mapBrandStatus(raw: string | undefined): string {
  const normalized = (raw ?? "").toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "failed" || normalized === "rejected") return "rejected";
  if (normalized === "in_review" || normalized === "pending") return "in_review";
  return "provisioning";
}

export async function syncWorkspaceA2pStatus({
  supabaseClient,
  workspaceId,
  actorUserId,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
}) {
  const { data: workspace, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) throw error;

  const twilioData = (workspace?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const brandSid = onboarding.a2p10dlc.brandSid;
  const campaignSid = onboarding.a2p10dlc.campaignSid;

  if (!brandSid && !campaignSid) {
    return onboarding;
  }

  const twilio = await createWorkspaceTwilioClient({
    supabase: supabaseClient,
    workspaceId,
  });

  let brandStatus = onboarding.a2p10dlc.status;
  let campaignStatus = onboarding.a2p10dlc.status;
  let rejectionReason = onboarding.a2p10dlc.rejectionReason;

  try {
    if (brandSid) {
      const brand = await (twilio as any).messaging?.v1?.brandRegistrations?.(brandSid)?.fetch?.();
      brandStatus = mapBrandStatus(brand?.status);
      if (brand?.failureReason) {
        rejectionReason = String(brand.failureReason);
      }
    }
    if (campaignSid) {
      const campaign = await (twilio as any).messaging?.v1?.services?.(
        onboarding.messagingService.serviceSid ?? "",
      )?.usAppToPerson?.(campaignSid)?.fetch?.();
      const rawStatus = campaign?.campaignStatus ?? campaign?.status;
      campaignStatus = mapBrandStatus(rawStatus);
    }
  } catch (syncError) {
    logger.error("A2P status sync failed:", syncError);
    return onboarding;
  }

  const mergedStatus =
    brandStatus === "rejected" || campaignStatus === "rejected"
      ? "rejected"
      : brandStatus === "approved" && campaignStatus === "approved"
        ? "approved"
        : onboarding.a2p10dlc.status;

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    a2p10dlc: {
      ...onboarding.a2p10dlc,
      status: mergedStatus,
      rejectionReason,
      lastSyncedAt: new Date().toISOString(),
    },
    lastUpdatedBy: actorUserId,
  });

  const { error: updateError } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data: {
        ...(isRecord(workspace?.twilio_data) ? workspace.twilio_data : {}),
        onboarding: nextOnboarding,
      } as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (updateError) throw updateError;

  return nextOnboarding;
}

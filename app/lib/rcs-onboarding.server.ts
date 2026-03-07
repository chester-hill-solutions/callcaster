import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingFromTwilioData,
  mergeWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import type {
  TwilioAccountData,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DEFAULT_RCS_PREREQUISITES = [
  "Confirm provider availability for the target region.",
  "Confirm rich-brand asset requirements with the selected provider.",
  "Validate compatible messaging entry points and support operations.",
];

async function persistWorkspaceRcsState({
  supabaseClient,
  workspaceId,
  twilioData,
  onboarding,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  twilioData: TwilioAccountData;
  onboarding: ReturnType<typeof getWorkspaceMessagingOnboardingFromTwilioData>;
}) {
  const baseData = isRecord(twilioData) ? twilioData : {};
  const { error } = await supabaseClient
    .from("workspace")
    .update({
      twilio_data: {
        ...baseData,
        onboarding,
      } as unknown as Database["public"]["Tables"]["workspace"]["Update"]["twilio_data"],
    })
    .eq("id", workspaceId);

  if (error) {
    throw error;
  }
}

export async function updateWorkspaceRcsOnboarding({
  supabaseClient,
  workspaceId,
  actorUserId,
  provider,
  regions,
  notes,
  status,
}: {
  supabaseClient: SupabaseClient<Database>;
  workspaceId: string;
  actorUserId: string | null;
  provider: string | null;
  regions: string[];
  notes: string;
  status: WorkspaceOnboardingStatus;
}) {
  const { data, error } = await supabaseClient
    .from("workspace")
    .select("twilio_data")
    .eq("id", workspaceId)
    .single();

  if (error) {
    throw error;
  }

  const twilioData = (data?.twilio_data ?? null) as TwilioAccountData;
  const onboarding = getWorkspaceMessagingOnboardingFromTwilioData(twilioData);
  const selectedChannels: WorkspaceOnboardingChannel[] = onboarding.selectedChannels.includes("rcs")
    ? onboarding.selectedChannels
    : [...onboarding.selectedChannels, "rcs"];
  const supportedChannels: WorkspaceOnboardingChannel[] = onboarding.messagingService.supportedChannels.includes("rcs")
    ? onboarding.messagingService.supportedChannels
    : [...onboarding.messagingService.supportedChannels, "rcs"];

  const nextOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
    selectedChannels,
    currentStep: "provider_provisioning",
    status,
    rcs: {
      ...onboarding.rcs,
      status,
      provider,
      regions,
      notes,
      prerequisites: onboarding.rcs.prerequisites.length > 0
        ? onboarding.rcs.prerequisites
        : DEFAULT_RCS_PREREQUISITES,
      lastSubmittedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    },
    messagingService: {
      ...onboarding.messagingService,
      supportedChannels,
    },
    lastUpdatedBy: actorUserId,
  });
  nextOnboarding.steps = buildOnboardingStepsForState(nextOnboarding);

  await persistWorkspaceRcsState({
    supabaseClient,
    workspaceId,
    twilioData,
    onboarding: nextOnboarding,
  });

  return nextOnboarding;
}

export { DEFAULT_RCS_PREREQUISITES };

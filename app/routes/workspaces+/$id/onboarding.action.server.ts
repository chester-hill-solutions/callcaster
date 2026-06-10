import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import {
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
} from "@/lib/messaging-onboarding.server";
import {
  getUserRole,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import {
  TWILIO_RCS_PROVIDER,
  isRcsOnboardingEnabled,
  stripDisabledRcsChannel,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { data as routeData, redirect } from "react-router";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { verifyAuth } from "@/lib/supabase.server";
import type { User } from "@/lib/types";
import type { ActionFunctionArgs } from "react-router";
import {
  asWorkspaceOnboardingStatus,
  buildBusinessProfile,
  isOnboardingActionName,
  readSelectedChannels,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";
import { reviewWorkspaceEmergencyVoice } from "@/lib/onboarding/emergency-voice.server";

export type { OnboardingActionData } from "@/lib/onboarding-actions.server";

type OnboardingActionContext = {
  formData: FormData;
  wsId: string;
  headers: Headers;
  supabaseClient: Awaited<ReturnType<typeof verifyAuth>>["supabaseClient"];
  user: NonNullable<Awaited<ReturnType<typeof verifyAuth>>["user"]>;
  actorUserId: string | null;
};

function redirectToOnboardingStep(
  workspaceId: string,
  step: string,
  headers: Headers,
  searchParams?: Record<string, string>,
): never {
  const params = new URLSearchParams({ step, ...searchParams });
  throw redirect(`/workspaces/${workspaceId}/onboarding?${params.toString()}`, { headers });
}

async function handleAdvanceStep(ctx: OnboardingActionContext) {
  const targetStep = String(ctx.formData.get("targetStep") ?? "");
  if (!isWizardOnboardingStepId(targetStep)) {
    return routeData<OnboardingActionData>({ error: "Invalid onboarding step." }, { status: 400 });
  }
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: targetStep },
  });
  redirectToOnboardingStep(ctx.wsId, targetStep, ctx.headers);
}

async function handleSkipFirstNumber(ctx: OnboardingActionContext) {
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "provider_provisioning" },
  });
  redirectToOnboardingStep(ctx.wsId, "provider_provisioning", ctx.headers, {
    skipped: "first_number",
  });
}

async function handleVerifyCallerId(ctx: OnboardingActionContext) {
  const phoneNumber = String(ctx.formData.get("phoneNumber") ?? "");
  const friendlyName = String(ctx.formData.get("friendlyName") ?? "");
  if (!phoneNumber.trim() || !friendlyName.trim()) {
    return routeData<OnboardingActionData>(
      { error: "Phone number and caller ID name are required." },
      { status: 400 },
    );
  }
  const { validationRequest } = await startWorkspaceCallerIdVerification({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    phoneNumber,
    friendlyName,
  });
  return routeData<OnboardingActionData>({
    success: "Verification call started. Enter the code when prompted.",
    validationRequest,
  });
}

async function handleSaveChannels(ctx: OnboardingActionContext) {
  const current = await getWorkspaceMessagingOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
  });
  const selectedChannels = stripDisabledRcsChannel(readSelectedChannels(ctx.formData));

  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: {
      selectedChannels,
      status: "collecting_business",
      currentStep: "messaging_service",
      emergencyVoice: selectedChannels.includes("voice_compliance")
        ? current.emergencyVoice
        : {
            ...current.emergencyVoice,
            enabled: false,
          },
    },
  });
  redirectToOnboardingStep(ctx.wsId, "messaging_service", ctx.headers);
}

async function handleBootstrapMessagingService(ctx: OnboardingActionContext) {
  const bootstrap = await ensureWorkspaceTwilioBootstrap({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.user.id,
  });

  if (bootstrap.serviceSid) {
    await persistWorkspaceOnboardingState({
      supabaseClient: ctx.supabaseClient,
      workspaceId: ctx.wsId,
      actorUserId: ctx.actorUserId,
      updates: { currentStep: "first_number" },
    });
    if (bootstrap.outcome === "success") {
      redirectToOnboardingStep(ctx.wsId, "first_number", ctx.headers, {
        provisioned: "messaging_service",
      });
    }
    if (bootstrap.outcome === "partial") {
      redirectToOnboardingStep(ctx.wsId, "first_number", ctx.headers, {
        provisioned: "messaging_service",
        warning:
          bootstrap.lastError ??
          "Messaging Service was created but some configuration is still incomplete.",
      });
    }
  }

  if (bootstrap.outcome === "success") {
    return routeData<OnboardingActionData>({
      success: "Messaging Service is ready.",
    });
  }

  if (bootstrap.outcome === "partial") {
    return routeData<OnboardingActionData>({
      warning:
        bootstrap.lastError ??
        "Messaging Service was created but some configuration is still incomplete. Review details below and retry.",
    });
  }

  return routeData<OnboardingActionData>(
    {
      error:
        bootstrap.lastError ??
        "Messaging Service could not be provisioned. Try again or contact support.",
    },
    { status: 500 },
  );
}

async function handleSaveBusinessProfile(ctx: OnboardingActionContext) {
  const current = await getWorkspaceMessagingOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
  });
  const businessProfile = buildBusinessProfile(ctx.formData);
  const addressStreet = String(ctx.formData.get("addressStreet") ?? "");
  const addressCity = String(ctx.formData.get("addressCity") ?? "");
  const addressRegion = String(ctx.formData.get("addressRegion") ?? "");
  const addressPostalCode = String(ctx.formData.get("addressPostalCode") ?? "");
  const addressCountryCode = String(ctx.formData.get("addressCountryCode") ?? "US");
  const hasEmergencyAddress = Boolean(
    addressStreet.trim() &&
      addressCity.trim() &&
      addressRegion.trim() &&
      addressPostalCode.trim(),
  );

  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: {
      businessProfile,
      status: "collecting_business",
      currentStep: "path_selection",
      emergencyVoice: {
        ...current.emergencyVoice,
        status: hasEmergencyAddress ? "collecting_business" : current.emergencyVoice.status,
        enabled: false,
        emergencyEligiblePhoneNumbers: [],
        ineligibleCallerIds: [],
        address: {
          ...current.emergencyVoice.address,
          customerName: businessProfile.legalBusinessName,
          street: addressStreet,
          city: addressCity,
          region: addressRegion,
          postalCode: addressPostalCode,
          countryCode: addressCountryCode,
          addressSid: null,
          status: hasEmergencyAddress ? "pending_validation" : "not_started",
          validationError: null,
          lastValidatedAt: null,
        },
        lastReviewedAt: null,
      },
    },
  });
  redirectToOnboardingStep(ctx.wsId, "path_selection", ctx.headers);
}

async function handleReviewEmergencyVoice(ctx: OnboardingActionContext) {
  return reviewWorkspaceEmergencyVoice({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
  });
}

async function handleProvisionA2p(ctx: OnboardingActionContext) {
  const nextState = await provisionWorkspaceA2P({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.user.id,
  });
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "launch_checks" },
  });
  if (nextState.reviewState.blockingIssues.length > 0) {
    return routeData<OnboardingActionData>({
      error:
        "A2P submission is blocked until the required onboarding and Trust Hub prerequisites are completed.",
    });
  }
  if (nextState.a2p10dlc.rejectionReason || nextState.reviewState.lastError) {
    return routeData<OnboardingActionData>({
      error:
        nextState.a2p10dlc.rejectionReason ??
        nextState.reviewState.lastError ??
        "A2P provisioning failed.",
    });
  }
  return routeData<OnboardingActionData>({
    success: "A2P brand and campaign were submitted for review.",
  });
}

async function handleSaveRcs(ctx: OnboardingActionContext) {
  if (!isRcsOnboardingEnabled()) {
    return routeData<OnboardingActionData>(
      { error: "RCS onboarding is not available." },
      { status: 400 },
    );
  }

  await updateWorkspaceRcsOnboarding({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.user.id,
    provider: TWILIO_RCS_PROVIDER,
    displayName: String(ctx.formData.get("rcsDisplayName") ?? ""),
    publicDescription: String(ctx.formData.get("rcsPublicDescription") ?? ""),
    logoImageUrl: String(ctx.formData.get("rcsLogoImageUrl") ?? ""),
    bannerImageUrl: String(ctx.formData.get("rcsBannerImageUrl") ?? ""),
    accentColor: String(ctx.formData.get("rcsAccentColor") ?? ""),
    optInPolicyImageUrl: String(ctx.formData.get("rcsOptInPolicyImageUrl") ?? ""),
    useCaseVideoUrl: String(ctx.formData.get("rcsUseCaseVideoUrl") ?? ""),
    representativeName: String(ctx.formData.get("rcsRepresentativeName") ?? ""),
    representativeTitle: String(ctx.formData.get("rcsRepresentativeTitle") ?? ""),
    representativeEmail: String(ctx.formData.get("rcsRepresentativeEmail") ?? ""),
    notificationEmail: String(ctx.formData.get("rcsNotificationEmail") ?? ""),
    agentId: String(ctx.formData.get("rcsAgentId") ?? "").trim() || null,
    senderId: String(ctx.formData.get("rcsSenderId") ?? "").trim() || null,
    regions: String(ctx.formData.get("rcsRegions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notes: String(ctx.formData.get("rcsNotes") ?? ""),
    status: asWorkspaceOnboardingStatus(ctx.formData.get("rcsStatus")),
  });
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.wsId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "launch_checks" },
  });
  return routeData<OnboardingActionData>({ success: "RCS onboarding state updated." });
}

const ONBOARDING_ACTION_HANDLERS = {
  advance_step: handleAdvanceStep,
  skip_first_number: handleSkipFirstNumber,
  verify_caller_id: handleVerifyCallerId,
  save_channels: handleSaveChannels,
  bootstrap_messaging_service: handleBootstrapMessagingService,
  save_business_profile: handleSaveBusinessProfile,
  review_emergency_voice: handleReviewEmergencyVoice,
  provision_a2p: handleProvisionA2p,
  save_rcs: handleSaveRcs,
} satisfies Record<
  OnboardingActionName,
  (ctx: OnboardingActionContext) => Promise<Response | ReturnType<typeof routeData<OnboardingActionData>> | void>
>;

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const wsId = params.id;
  if (!wsId) {
    return routeData<OnboardingActionData>({ error: "Workspace ID is required." }, { status: 400 });
  }
  const actorUserId = user.id ?? null;

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId: wsId,
  });

  const role = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId: wsId,
    })
  )?.role;

  if (role !== "owner" && role !== "admin") {
    return routeData<OnboardingActionData>(
      { error: "Only workspace admins can change onboarding state." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const actionName = String(formData.get("_action") ?? "");

  if (!isOnboardingActionName(actionName)) {
    return routeData<OnboardingActionData>({ error: "Unknown onboarding action." }, { status: 400 });
  }

  const ctx: OnboardingActionContext = {
    formData,
    wsId,
    headers,
    supabaseClient,
    user,
    actorUserId,
  };

  try {
    return await ONBOARDING_ACTION_HANDLERS[actionName](ctx);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return routeData<OnboardingActionData>(
      {
        error: error instanceof Error ? error.message : "Onboarding update failed.",
      },
      { status: 500 },
    );
  }
};

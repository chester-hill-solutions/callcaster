import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import {
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
} from "@/lib/messaging-onboarding.server";
import {
  asWorkspaceOnboardingStatus,
  buildBusinessProfile,
  readChannelInlineBusinessFields,
  readSelectedChannels,
  readSelectedGoal,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import {
  channelsForOnboardingGoal,
  nextWizardStep,
} from "@/lib/messaging-onboarding/goals";
import { isWorkspaceIntakeComplete } from "@/lib/messaging-onboarding/intake";
import {
  BUSINESS_IDENTITY_REQUIRED_FIELDS,
  BUSINESS_PROGRAM_REQUIRED_FIELDS,
  businessProfileFieldRequiredMessage,
  findMissingBusinessProfileFields,
} from "@/lib/messaging-onboarding/predicates";
import { reviewWorkspaceEmergencyVoice } from "@/lib/onboarding/emergency-voice.server";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";
import {
  TWILIO_RCS_PROVIDER,
  isRcsOnboardingEnabled,
  stripDisabledRcsChannel,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { updateWorkspaceName } from "@/lib/platform-workspace.server";
import { enqueueWorkspaceComplianceJob } from "@/lib/worker/handlers.server";
import { attachWorkspaceRcsSenderToPool } from "@/lib/twilio-sender-pool.server";
import {
  redirectToReturnToOrPayload,
  resolveOnboardingInput,
  resolveOperatingCountryFromForm,
  type OnboardingActionContext,
  type OnboardingHandlerResult,
} from "@/lib/platform-onboarding-helpers.server";

// Compliance channels that trigger the Twilio compliance provisioning job.
// `toll_free_bulk_sms` is a Phase C channel referenced by string literal (it is
// not yet in the WorkspaceOnboardingChannel union), so channels are compared as
// plain strings here.
const COMPLIANCE_CHANNELS = ["toll_free_bulk_sms", "a2p10dlc"] as const;

async function handleAdvanceStep(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const targetStep = String(formData.get("targetStep") ?? formData.get("target_step") ?? "");
  if (!isWizardOnboardingStepId(targetStep)) {
    return {
      kind: "payload",
      data: { error: "Invalid onboarding step." },
      status: 400,
    };
  }
  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: targetStep },
  });
  return { kind: "redirect", step: targetStep };
}

async function handleSaveWorkspaceName(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const name = String(
    formData.get("workspaceName") ?? formData.get("workspace_name") ?? "",
  ).trim();

  if (!name) {
    return {
      kind: "payload",
      data: { error: "Enter a workspace name to continue." },
      status: 400,
    };
  }
  if (name.length > 200) {
    return {
      kind: "payload",
      data: { error: "Workspace name must be 200 characters or fewer." },
      status: 400,
    };
  }

  const result = await updateWorkspaceName(ctx.user.id, ctx.workspaceId, name);
  if (!result.ok) {
    return {
      kind: "payload",
      data: { error: result.error },
      status: result.status,
    };
  }

  await persistWorkspaceOnboardingState({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      status: "collecting_business",
      currentStep: "path_selection",
    },
  });

  return { kind: "redirect", step: "path_selection" };
}

async function handleSkipFirstNumber(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const current = await getWorkspaceMessagingOnboardingState({
    workspaceId: ctx.workspaceId,
  });
  const targetStep =
    nextWizardStep("first_number", current.selectedGoal) ?? "script";
  await persistWorkspaceOnboardingState({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: targetStep },
  });
  return {
    kind: "redirect",
    step: targetStep,
    searchParams: { skipped: "first_number" },
  };
}

async function handleVerifyCallerId(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const phoneNumber = String(formData.get("phoneNumber") ?? formData.get("phone_number") ?? "");
  const friendlyName = String(formData.get("friendlyName") ?? formData.get("friendly_name") ?? "");
  if (!phoneNumber.trim() || !friendlyName.trim()) {
    return {
      kind: "payload",
      data: { error: "Phone number and caller ID name are required." },
      status: 400,
    };
  }
  const { validationRequest } = await startWorkspaceCallerIdVerification({workspaceId: ctx.workspaceId,
    phoneNumber,
    friendlyName,
  });
  return {
    kind: "payload",
    data: {
      success: "Verification call started. Enter the code when prompted.",
      validationRequest,
    },
  };
}

async function handleSaveChannels(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const current = await getWorkspaceMessagingOnboardingState({workspaceId: ctx.workspaceId,
  });
  const selectedGoal = readSelectedGoal(formData) ?? current.selectedGoal;
  const channelsFromForm = readSelectedChannels(formData);
  const selectedChannels = stripDisabledRcsChannel(
    channelsFromForm.length > 0
      ? channelsFromForm
      : selectedGoal
        ? channelsForOnboardingGoal(selectedGoal, current.operatingCountry)
        : [],
  );

  if (!selectedGoal && selectedChannels.length === 0) {
    return {
      kind: "payload",
      data: { error: "Choose a goal to continue setup." },
      status: 400,
    };
  }

  // SMS goals still collect toll-free / A2P Trust Hub fields inline when shown.
  const businessProfile = readChannelInlineBusinessFields(
    formData,
    current.businessProfile,
  );

  // The Messaging Service is auto-provisioned at workspace create via
  // ensureWorkspaceTwilioBootstrap; there is no dedicated wizard step for it.
  // Ensure it exists (idempotent) so the number step can attach senders.
  if (!current.messagingService.serviceSid) {
    try {
      await ensureWorkspaceTwilioBootstrap({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.user.id,
      });
    } catch (error) {
      return {
        kind: "payload",
        data: {
          error:
            error instanceof Error
              ? error.message
              : "We couldn't set up messaging for this workspace. Please try again.",
        },
        status: 400,
      };
    }
  }

  const operatingCountry = resolveOperatingCountryFromForm(
    formData,
    current.operatingCountry,
  );

  // Re-derive channels from the resolved goal + country so intake country
  // changes (CA ↔ US) update TFV/A2P selection without a second form.
  const channelsForGoal = selectedGoal
    ? channelsForOnboardingGoal(selectedGoal, operatingCountry)
    : selectedChannels;
  const resolvedChannels = stripDisabledRcsChannel(
    channelsFromForm.length > 0 ? selectedChannels : channelsForGoal,
  );

  const nextStep =
    nextWizardStep("path_selection", selectedGoal) ?? "business_identity";

  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      selectedChannels: resolvedChannels,
      selectedGoal,
      operatingCountry,
      businessProfile,
      status: "collecting_business",
      currentStep: nextStep,
    },
  });

  // Kick off Twilio compliance provisioning when a compliance path is newly
  // selected. Idempotent enqueue — repeated saves do not stack duplicate jobs.
  const previousChannels = new Set(current.selectedChannels as string[]);
  const nextChannels = resolvedChannels as string[];
  const newlySelectedCompliance = COMPLIANCE_CHANNELS.some(
    (channel) => nextChannels.includes(channel) && !previousChannels.has(channel),
  );
  if (newlySelectedCompliance) {
    await enqueueWorkspaceComplianceJob(ctx.workspaceId, "channels_selected");
  }

  return { kind: "redirect", step: nextStep };
}

/**
 * Legacy action retained for API backward-compatibility. The Messaging Service
 * is now auto-provisioned at workspace create, so this just ensures it exists
 * (idempotent) and routes to the first-number step.
 */
async function handleBootstrapMessagingService(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  await ensureWorkspaceTwilioBootstrap({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
  });
  await persistWorkspaceOnboardingState({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "first_number" },
  });
  return { kind: "redirect", step: "first_number" };
}

async function handleSaveBusinessProfile(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const current = await getWorkspaceMessagingOnboardingState({workspaceId: ctx.workspaceId,
  });
  const businessProfile = buildBusinessProfile(formData, current.businessProfile);

  const wizardStepRaw = String(
    formData.get("wizardStep") ?? formData.get("wizard_step") ?? "",
  ).trim();
  const wizardStep =
    wizardStepRaw === "business_identity" || wizardStepRaw === "business_program"
      ? wizardStepRaw
      : null;

  // Identity / Program screens validate a subset; capability gates and API posts
  // without a wizard hint still require the full baseline.
  const missingFields =
    wizardStep === "business_identity"
      ? findMissingBusinessProfileFields(
          businessProfile,
          BUSINESS_IDENTITY_REQUIRED_FIELDS,
        )
      : wizardStep === "business_program"
        ? findMissingBusinessProfileFields(
            businessProfile,
            BUSINESS_PROGRAM_REQUIRED_FIELDS,
          )
        : findMissingBusinessProfileFields(businessProfile);
  if (missingFields.length > 0) {
    return {
      kind: "payload",
      data: {
        error: missingFields.map(businessProfileFieldRequiredMessage).join(" "),
      },
      status: 400,
    };
  }

  const operatingCountry = resolveOperatingCountryFromForm(
    formData,
    current.operatingCountry,
  );

  // Goal is chosen first; identity/program advance along wizardStepsForGoal (#1104).
  const nextStep =
    wizardStep === "business_identity" || wizardStep === "business_program"
      ? (nextWizardStep(wizardStep, current.selectedGoal) ?? "audience")
      : (nextWizardStep("business_identity", current.selectedGoal) ?? "audience");

  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      businessProfile,
      operatingCountry,
      status: "collecting_business",
      currentStep: nextStep,
    },
  });

  // If a compliance path is already selected, (re)enqueue compliance provisioning
  // so Trust Hub can consume the updated profile. Address collection is separate
  // (save_service_address / Numbers settings). Idempotent enqueue.
  const compliancePathSelected = COMPLIANCE_CHANNELS.some((channel) =>
    (current.selectedChannels as string[]).includes(channel),
  );
  if (compliancePathSelected) {
    await enqueueWorkspaceComplianceJob(
      ctx.workspaceId,
      "business_profile_saved",
    );
  }

  // A step-hinted save comes from the wizard's "Save & continue" and must
  // land on the next step. Intake is already complete by the time the Program
  // step saves (the Identity save completed it), so gating on intake alone
  // sent that save back to a payload and the wizard never moved (#1471).
  // Hint-less posts (API, capability surfaces) still return to where they came from.
  if (wizardStep === null && isWorkspaceIntakeComplete(current)) {
    return redirectToReturnToOrPayload(
      formData,
      ctx.workspaceId,
      "business_profile",
      "Business and compliance details saved.",
    );
  }

  return { kind: "redirect", step: nextStep };
}

async function handleSaveServiceAddress(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const current = await getWorkspaceMessagingOnboardingState({
    workspaceId: ctx.workspaceId,
  });
  const addressStreet = String(
    formData.get("addressStreet") ?? formData.get("address_street") ?? "",
  ).trim();
  const addressCity = String(
    formData.get("addressCity") ?? formData.get("address_city") ?? "",
  ).trim();
  const addressRegion = String(
    formData.get("addressRegion") ?? formData.get("address_region") ?? "",
  ).trim();
  const addressPostalCode = String(
    formData.get("addressPostalCode") ?? formData.get("address_postal_code") ?? "",
  ).trim();
  const addressCountryCode = String(
    formData.get("addressCountryCode") ?? formData.get("address_country_code") ?? "CA",
  ).trim();
  const customerName = String(
    formData.get("customerName") ??
      formData.get("customer_name") ??
      current.businessProfile.legalBusinessName ??
      "",
  ).trim();

  if (!addressStreet || !addressCity || !addressRegion || !addressPostalCode) {
    return {
      kind: "payload",
      data: {
        error:
          "Enter street, city, region, and postal code before renting a voice number.",
      },
      status: 400,
    };
  }

  await persistWorkspaceOnboardingState({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      emergencyVoice: {
        ...current.emergencyVoice,
        status: "collecting_business",
        address: {
          ...current.emergencyVoice.address,
          customerName:
            customerName || current.emergencyVoice.address.customerName,
          street: addressStreet,
          city: addressCity,
          region: addressRegion,
          postalCode: addressPostalCode,
          countryCode: addressCountryCode || "CA",
          addressSid: null,
          status: "pending_validation",
          validationError: null,
          lastValidatedAt: null,
        },
      },
    },
  });

  return redirectToReturnToOrPayload(
    formData,
    ctx.workspaceId,
    "service_address",
    "Service address saved. Validate it before renting a voice-capable number.",
  );
}

async function handleReviewEmergencyVoice(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const result = await reviewWorkspaceEmergencyVoice({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
  });

  if (!result.ok) {
    return redirectToReturnToOrPayload(
      formData,
      ctx.workspaceId,
      "emergency_voice",
      "",
      { error: result.error, status: result.status },
    );
  }

  return redirectToReturnToOrPayload(
    formData,
    ctx.workspaceId,
    "emergency_voice",
    result.success ?? "Service address validated.",
  );
}

async function handleProvisionA2p(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const nextState = await provisionWorkspaceA2P({workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
  });
  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "launch_checks" },
  });
  if (nextState.reviewState.blockingIssues.length > 0) {
    return {
      kind: "payload",
      data: {
        error:
          "A2P submission is blocked until the required onboarding and Trust Hub prerequisites are completed.",
      },
    };
  }
  if (nextState.a2p10dlc.rejectionReason || nextState.reviewState.lastError) {
    return {
      kind: "payload",
      data: {
        error:
          nextState.a2p10dlc.rejectionReason ??
          nextState.reviewState.lastError ??
          "A2P provisioning failed.",
      },
    };
  }
  return {
    kind: "payload",
    data: { success: "A2P brand and campaign were submitted for review." },
  };
}

async function handleSaveRcs(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  if (!isRcsOnboardingEnabled()) {
    return {
      kind: "payload",
      data: { error: "RCS onboarding is not available." },
      status: 400,
    };
  }

  const formData = resolveOnboardingInput(ctx.input);

  await updateWorkspaceRcsOnboarding({workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
    provider: TWILIO_RCS_PROVIDER,
    displayName: String(formData.get("rcsDisplayName") ?? formData.get("rcs_display_name") ?? ""),
    publicDescription: String(
      formData.get("rcsPublicDescription") ?? formData.get("rcs_public_description") ?? "",
    ),
    logoImageUrl: String(formData.get("rcsLogoImageUrl") ?? formData.get("rcs_logo_image_url") ?? ""),
    bannerImageUrl: String(
      formData.get("rcsBannerImageUrl") ?? formData.get("rcs_banner_image_url") ?? "",
    ),
    accentColor: String(formData.get("rcsAccentColor") ?? formData.get("rcs_accent_color") ?? ""),
    optInPolicyImageUrl: String(
      formData.get("rcsOptInPolicyImageUrl") ?? formData.get("rcs_opt_in_policy_image_url") ?? "",
    ),
    useCaseVideoUrl: String(
      formData.get("rcsUseCaseVideoUrl") ?? formData.get("rcs_use_case_video_url") ?? "",
    ),
    representativeName: String(
      formData.get("rcsRepresentativeName") ?? formData.get("rcs_representative_name") ?? "",
    ),
    representativeTitle: String(
      formData.get("rcsRepresentativeTitle") ?? formData.get("rcs_representative_title") ?? "",
    ),
    representativeEmail: String(
      formData.get("rcsRepresentativeEmail") ?? formData.get("rcs_representative_email") ?? "",
    ),
    notificationEmail: String(
      formData.get("rcsNotificationEmail") ?? formData.get("rcs_notification_email") ?? "",
    ),
    agentId:
      String(formData.get("rcsAgentId") ?? formData.get("rcs_agent_id") ?? "").trim() || null,
    senderId:
      String(formData.get("rcsSenderId") ?? formData.get("rcs_sender_id") ?? "").trim() || null,
    regions: String(formData.get("rcsRegions") ?? formData.get("rcs_regions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notes: String(formData.get("rcsNotes") ?? formData.get("rcs_notes") ?? ""),
    status: asWorkspaceOnboardingStatus(
      formData.get("rcsStatus") ?? formData.get("rcs_status"),
    ),
  });
  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "launch_checks" },
  });
  return {
    kind: "payload",
    data: { success: "RCS onboarding state updated." },
  };
}

async function handleAttachRcsSender(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  if (!isRcsOnboardingEnabled()) {
    return {
      kind: "payload",
      data: { error: "RCS onboarding is not available." },
      status: 400,
    };
  }

  const result = await attachWorkspaceRcsSenderToPool({ workspaceId: ctx.workspaceId });

  if (!result.serviceSid) {
    return {
      kind: "payload",
      data: { error: "Provision a Messaging Service before attaching the RCS sender." },
      status: 400,
    };
  }
  if (!result.rcsSenderId) {
    return {
      kind: "payload",
      data: {
        error:
          "Save the Twilio Sender SID from Console (once your RCS sender is approved) before attaching it to the pool.",
      },
      status: 400,
    };
  }

  return {
    kind: "payload",
    data: {
      success: result.alreadyInPool
        ? `RCS sender ${result.rcsSenderId} is already attached to the sender pool.`
        : `RCS sender ${result.rcsSenderId} attached to the sender pool.`,
    },
  };
}

export const ONBOARDING_ACTION_HANDLERS = {
  save_workspace_name: handleSaveWorkspaceName,
  advance_step: handleAdvanceStep,
  skip_first_number: handleSkipFirstNumber,
  verify_caller_id: handleVerifyCallerId,
  save_channels: handleSaveChannels,
  bootstrap_messaging_service: handleBootstrapMessagingService,
  save_business_profile: handleSaveBusinessProfile,
  save_service_address: handleSaveServiceAddress,
  review_emergency_voice: handleReviewEmergencyVoice,
  provision_a2p: handleProvisionA2p,
  save_rcs: handleSaveRcs,
  attach_rcs_sender: handleAttachRcsSender,
} satisfies Record<OnboardingActionName, (ctx: OnboardingActionContext) => Promise<OnboardingHandlerResult>>;

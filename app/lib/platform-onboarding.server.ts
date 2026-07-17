import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
} from "@/lib/database/workspace.server";
import type { Database , Tables } from "@/lib/db-types";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  applyWorkspaceOnboardingChannelPolicy,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
} from "@/lib/messaging-onboarding.server";
import {
  asWorkspaceOnboardingStatus,
  buildBusinessProfile,
  isOnboardingActionName,
  readChannelInlineBusinessFields,
  readSelectedChannels,
  readSelectedGoal,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import {
  channelsForOnboardingGoal,
  nextWizardStep,
} from "@/lib/messaging-onboarding/goals";
import {
  businessProfileFieldRequiredMessage,
  findMissingBusinessProfileFields,
} from "@/lib/messaging-onboarding/predicates";
import { reviewWorkspaceEmergencyVoice } from "@/lib/onboarding/emergency-voice.server";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import {
  TWILIO_RCS_PROVIDER,
  getWorkspaceRcsBlockingIssues,
  hydrateWorkspaceRcsOnboardingState,
  isRcsOnboardingEnabled,
  stripDisabledRcsChannel,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { buildA2pBlockingIssues, provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { enqueueWorkspaceComplianceJob } from "@/lib/worker/handlers.server";

// Compliance channels that trigger the Twilio compliance provisioning job.
// `toll_free_bulk_sms` is a Phase C channel referenced by string literal (it is
// not yet in the WorkspaceOnboardingChannel union), so channels are compared as
// plain strings here.
const COMPLIANCE_CHANNELS = ["toll_free_bulk_sms", "a2p10dlc"] as const;
import { attachWorkspaceRcsSenderToPool } from "@/lib/twilio-sender-pool.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
  WorkspaceOperatingCountry,
} from "@/lib/types";
import { WORKSPACE_OPERATING_COUNTRY_VALUES } from "@/lib/types";

export type OnboardingHandlerResult =
  | {
      kind: "redirect";
      step: string;
      searchParams?: Record<string, string>;
    }
  | {
      kind: "payload";
      data: OnboardingActionData;
      status?: number;
    };

export type OnboardingActionContext = {
  input: FormData | Record<string, unknown>;
  workspaceId: string;
  user: { id: string };
  actorUserId: string | null;
};

export type WorkspaceOnboardingDetail = {
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  a2p_blocking_issues: string[];
  rcs_blocking_issues: string[];
  phone_numbers: Tables<"workspace_number">[] | null;
  credits_balance: number;
};

function jsonInputToFormData(body: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (key === "sampleMessages" || key === "sample_messages") {
        formData.set(
          "sampleMessages",
          value.map((item) => String(item)).join("\n"),
        );
        continue;
      }
      const formKey = key === "selected_channels" ? "selectedChannels" : key;
      for (const item of value) {
        formData.append(formKey, String(item));
      }
      continue;
    }
    if (key === "sample_messages") {
      formData.set("sampleMessages", String(value));
      continue;
    }
    formData.set(key, String(value));
  }
  return formData;
}

export function resolveOnboardingInput(
  input: FormData | Record<string, unknown>,
): FormData {
  return input instanceof FormData ? input : jsonInputToFormData(input);
}

function adaptRouteDataResult(result: unknown): OnboardingHandlerResult {
  if (result && typeof result === "object" && "data" in result) {
    const wrapped = result as {
      data: OnboardingActionData;
      init?: number | { status?: number } | null;
    };
    const status =
      typeof wrapped.init === "number"
        ? wrapped.init
        : wrapped.init?.status ?? 200;
    return { kind: "payload", data: wrapped.data, status };
  }
  return { kind: "payload", data: {}, status: 200 };
}

async function hydrateWorkspaceOnboarding(
  workspaceId: string,
) {
  const [{ data: phoneNumbers }, onboarding] = await Promise.all([
    getWorkspacePhoneNumbers({ workspaceId }),
    getWorkspaceMessagingOnboardingState({ workspaceId }),
  ]);

  const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
    hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
    phoneNumbers ?? [],
  );

  return { phoneNumbers: phoneNumbers ?? null, onboarding: hydratedOnboarding };
}

export async function requireOnboardingAdmin(
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const role = (
    await getUserRole({
      user: { id: userId },
      workspaceId,
    })
  )?.role;

  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      error: "Only workspace admins can change onboarding state.",
      status: 403,
    };
  }

  return { ok: true };
}

export async function getWorkspaceOnboardingDetail(
  userId: string,
  workspaceId: string,
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const [{ onboarding, phoneNumbers }, credits] = await Promise.all([
    hydrateWorkspaceOnboarding(workspaceId),
    getWorkspaceCredits(workspaceId),
  ]);

  const rcsBlockingIssues =
    isRcsOnboardingEnabled() && onboarding.selectedChannels.includes("rcs")
      ? getWorkspaceRcsBlockingIssues(onboarding)
      : [];

  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding,
    workspaceNumbers: (phoneNumbers ?? []).map((number) => ({
      type: number?.type ?? null,
      phone_number: number?.phone_number ?? null,
      capabilities: number?.capabilities ?? null,
    })),
    recentOutboundCount: 0,
  });

  return {
    ok: true,
    detail: {
      onboarding,
      readiness,
      a2p_blocking_issues: buildA2pBlockingIssues(onboarding),
      rcs_blocking_issues: rcsBlockingIssues,
      phone_numbers: phoneNumbers,
      credits_balance: credits ?? 0,
    },
  };
}

export async function patchWorkspaceOnboarding(
  userId: string,
  workspaceId: string,
  updates: {
    current_step?: string;
    selected_channels?: Array<
      "a2p10dlc" | "rcs" | "voice_compliance" | "toll_free_bulk_sms" | "local_number"
    >;
    status?: ReturnType<typeof asWorkspaceOnboardingStatus>;
  },
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  const admin = await requireOnboardingAdmin(userId, workspaceId);
  if (!admin.ok) {
    return admin;
  }

  const persistUpdates: Partial<WorkspaceMessagingOnboardingState> = {};

  if (updates.current_step !== undefined) {
    if (!isWizardOnboardingStepId(updates.current_step)) {
      return { ok: false, error: "Invalid onboarding step.", status: 400 };
    }
    persistUpdates.currentStep = updates.current_step;
  }

  if (updates.selected_channels !== undefined) {
    persistUpdates.selectedChannels = stripDisabledRcsChannel(updates.selected_channels);
  }

  if (updates.status !== undefined) {
    persistUpdates.status = updates.status;
  }

  if (Object.keys(persistUpdates).length === 0) {
    return { ok: false, error: "No onboarding fields to update.", status: 400 };
  }

  await persistWorkspaceOnboardingState({
    workspaceId,
    actorUserId: userId,
    updates: persistUpdates,
  });

  const detail = await getWorkspaceOnboardingDetail(userId, workspaceId);
  if (!detail.ok) {
    return detail;
  }
  return { ok: true, detail: detail.detail };
}

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

  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      selectedChannels,
      selectedGoal,
      businessProfile,
      status: "collecting_business",
      currentStep: "audience",
    },
  });

  // Kick off Twilio compliance provisioning when a compliance path is newly
  // selected. Idempotent enqueue — repeated saves do not stack duplicate jobs.
  const previousChannels = new Set(current.selectedChannels as string[]);
  const nextChannels = selectedChannels as string[];
  const newlySelectedCompliance = COMPLIANCE_CHANNELS.some(
    (channel) => nextChannels.includes(channel) && !previousChannels.has(channel),
  );
  if (newlySelectedCompliance) {
    await enqueueWorkspaceComplianceJob(ctx.workspaceId, "channels_selected");
  }

  return { kind: "redirect", step: "audience" };
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

  // Gate the step server-side: `buildBusinessProfile` overwrites the core fields
  // from the submitted form unconditionally, so this validates exactly the state
  // that would be persisted. Returning a payload (not a redirect) is what keeps
  // the wizard on Business basics instead of advancing to path_selection.
  const missingFields = findMissingBusinessProfileFields(businessProfile);
  if (missingFields.length > 0) {
    return {
      kind: "payload",
      data: {
        error: missingFields.map(businessProfileFieldRequiredMessage).join(" "),
      },
      status: 400,
    };
  }

  const addressStreet = String(formData.get("addressStreet") ?? formData.get("address_street") ?? "");
  const addressCity = String(formData.get("addressCity") ?? formData.get("address_city") ?? "");
  const addressRegion = String(formData.get("addressRegion") ?? formData.get("address_region") ?? "");
  const addressPostalCode = String(
    formData.get("addressPostalCode") ?? formData.get("address_postal_code") ?? "",
  );
  const addressCountryCode = String(
    formData.get("addressCountryCode") ?? formData.get("address_country_code") ?? "CA",
  );
  const operatingCountryRaw = String(
    formData.get("operatingCountry") ?? formData.get("operating_country") ?? "",
  );
  const operatingCountry: WorkspaceOperatingCountry =
    WORKSPACE_OPERATING_COUNTRY_VALUES.includes(
      operatingCountryRaw as WorkspaceOperatingCountry,
    )
      ? (operatingCountryRaw as WorkspaceOperatingCountry)
      : current.operatingCountry;
  const hasEmergencyAddress = Boolean(
    addressStreet.trim() &&
      addressCity.trim() &&
      addressRegion.trim() &&
      addressPostalCode.trim(),
  );

  await persistWorkspaceOnboardingState({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: {
      businessProfile,
      operatingCountry,
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

  // If a compliance path is already selected and the business profile now has a
  // usable service address, (re)enqueue compliance provisioning so Trust Hub can
  // consume the updated profile. Idempotent enqueue.
  const compliancePathSelected = COMPLIANCE_CHANNELS.some((channel) =>
    (current.selectedChannels as string[]).includes(channel),
  );
  if (compliancePathSelected && hasEmergencyAddress) {
    await enqueueWorkspaceComplianceJob(
      ctx.workspaceId,
      "business_profile_saved",
    );
  }

  return { kind: "redirect", step: "path_selection" };
}

async function handleReviewEmergencyVoice(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const result = await reviewWorkspaceEmergencyVoice({workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
  });
  return adaptRouteDataResult(result);
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
  attach_rcs_sender: handleAttachRcsSender,
} satisfies Record<OnboardingActionName, (ctx: OnboardingActionContext) => Promise<OnboardingHandlerResult>>;

export async function runOnboardingAction(
  userId: string,
  workspaceId: string,
  actionName: string,
  input: FormData | Record<string, unknown>,
): Promise<
  | {
      ok: true;
      result: OnboardingHandlerResult;
      detail: WorkspaceOnboardingDetail;
    }
  | { ok: false; error: string; status: number }
> {
  if (!isOnboardingActionName(actionName)) {
    return { ok: false, error: "Unknown onboarding action.", status: 400 };
  }

  const admin = await requireOnboardingAdmin(userId, workspaceId);
  if (!admin.ok) {
    return admin;
  }

  const ctx: OnboardingActionContext = {
    input,
    workspaceId, 
    user: { id: userId },
    actorUserId: userId,
  };

  try {
    const result = await ONBOARDING_ACTION_HANDLERS[actionName](ctx);
    const detail = await getWorkspaceOnboardingDetail(userId, workspaceId);
    if (!detail.ok) {
      return detail;
    }
    return { ok: true, result, detail: detail.detail };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Onboarding update failed.",
      status: 500,
    };
  }
}

export type MappedOnboardingResult =
  | {
      kind: "ui_redirect";
      step: string;
      searchParams?: Record<string, string>;
    }
  | {
      kind: "ui_payload";
      data: OnboardingActionData;
      status: number;
    }
  | {
      kind: "api_json";
      body: Record<string, unknown>;
      status: number;
    };

export function mapOnboardingHandlerResult(
  handlerResult: OnboardingHandlerResult,
  detail: WorkspaceOnboardingDetail,
  target: "ui" | "api",
): MappedOnboardingResult {
  if (handlerResult.kind === "redirect") {
    if (target === "ui") {
      return {
        kind: "ui_redirect",
        step: handlerResult.step,
        searchParams: handlerResult.searchParams,
      };
    }
    return {
      kind: "api_json",
      body: {
        ...detail,
        redirect: {
          step: handlerResult.step,
          search_params: handlerResult.searchParams ?? null,
        },
      },
      status: 200,
    };
  }

  const status = handlerResult.status ?? (handlerResult.data.error ? 400 : 200);
  if (target === "ui") {
    return {
      kind: "ui_payload",
      data: handlerResult.data,
      status,
    };
  }

  const apiStatus =
    handlerResult.data.error && status < 400 ? 400 : status;

  return {
    kind: "api_json",
    body: { ...detail, ...handlerResult.data },
    status: apiStatus,
  };
}

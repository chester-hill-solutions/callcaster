import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import {
  getUserRole,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
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
  readSelectedChannels,
  type OnboardingActionData,
  type OnboardingActionName,
} from "@/lib/onboarding-actions.server";
import { reviewWorkspaceEmergencyVoice } from "@/lib/onboarding/emergency-voice.server";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";
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
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/lib/database.types";

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
  supabaseClient: SupabaseClient<Database>;
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
  supabaseClient: SupabaseClient<Database>,
  workspaceId: string,
) {
  const [{ data: phoneNumbers }, onboarding] = await Promise.all([
    getWorkspacePhoneNumbers({ supabaseClient, workspaceId }),
    getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
  ]);

  const hydratedOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
    hydrateWorkspaceRcsOnboardingState(applyWorkspaceOnboardingChannelPolicy(onboarding)),
    phoneNumbers ?? [],
  );

  return { phoneNumbers: phoneNumbers ?? null, onboarding: hydratedOnboarding };
}

export async function requireOnboardingAdmin(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const role = (
    await getUserRole({
      supabaseClient,
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
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const [{ onboarding, phoneNumbers }, workspaceCredits] = await Promise.all([
    hydrateWorkspaceOnboarding(supabaseClient, workspaceId),
    supabaseClient.from("workspace").select("credits").eq("id", workspaceId).single(),
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
      credits_balance: workspaceCredits.data?.credits ?? 0,
    },
  };
}

export async function patchWorkspaceOnboarding(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  updates: {
    current_step?: string;
    selected_channels?: Array<"a2p10dlc" | "rcs" | "voice_compliance">;
    status?: ReturnType<typeof asWorkspaceOnboardingStatus>;
  },
): Promise<
  | { ok: true; detail: WorkspaceOnboardingDetail }
  | { ok: false; error: string; status: number }
> {
  const admin = await requireOnboardingAdmin(supabaseClient, userId, workspaceId);
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
    supabaseClient,
    workspaceId,
    actorUserId: userId,
    updates: persistUpdates,
  });

  const detail = await getWorkspaceOnboardingDetail(supabaseClient, userId, workspaceId);
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
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: targetStep },
  });
  return { kind: "redirect", step: targetStep };
}

async function handleSkipFirstNumber(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "provider_provisioning" },
  });
  return {
    kind: "redirect",
    step: "provider_provisioning",
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
  const { validationRequest } = await startWorkspaceCallerIdVerification({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
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
  const current = await getWorkspaceMessagingOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
  });
  const selectedChannels = stripDisabledRcsChannel(readSelectedChannels(formData));

  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
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
  return { kind: "redirect", step: "messaging_service" };
}

async function handleBootstrapMessagingService(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const bootstrap = await ensureWorkspaceTwilioBootstrap({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
  });

  if (bootstrap.serviceSid) {
    await persistWorkspaceOnboardingState({
      supabaseClient: ctx.supabaseClient,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actorUserId,
      updates: { currentStep: "first_number" },
    });
    if (bootstrap.outcome === "success") {
      return {
        kind: "redirect",
        step: "first_number",
        searchParams: { provisioned: "messaging_service" },
      };
    }
    if (bootstrap.outcome === "partial") {
      return {
        kind: "redirect",
        step: "first_number",
        searchParams: {
          provisioned: "messaging_service",
          warning:
            bootstrap.lastError ??
            "Messaging Service was created but some configuration is still incomplete.",
        },
      };
    }
  }

  if (bootstrap.outcome === "success") {
    return {
      kind: "payload",
      data: { success: "Messaging Service is ready." },
    };
  }

  if (bootstrap.outcome === "partial") {
    return {
      kind: "payload",
      data: {
        warning:
          bootstrap.lastError ??
          "Messaging Service was created but some configuration is still incomplete. Review details below and retry.",
      },
    };
  }

  return {
    kind: "payload",
    data: {
      error:
        bootstrap.lastError ??
        "Messaging Service could not be provisioned. Try again or contact support.",
    },
    status: 500,
  };
}

async function handleSaveBusinessProfile(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const formData = resolveOnboardingInput(ctx.input);
  const current = await getWorkspaceMessagingOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
  });
  const businessProfile = buildBusinessProfile(formData);
  const addressStreet = String(formData.get("addressStreet") ?? formData.get("address_street") ?? "");
  const addressCity = String(formData.get("addressCity") ?? formData.get("address_city") ?? "");
  const addressRegion = String(formData.get("addressRegion") ?? formData.get("address_region") ?? "");
  const addressPostalCode = String(
    formData.get("addressPostalCode") ?? formData.get("address_postal_code") ?? "",
  );
  const addressCountryCode = String(
    formData.get("addressCountryCode") ?? formData.get("address_country_code") ?? "US",
  );
  const hasEmergencyAddress = Boolean(
    addressStreet.trim() &&
      addressCity.trim() &&
      addressRegion.trim() &&
      addressPostalCode.trim(),
  );

  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
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
  return { kind: "redirect", step: "path_selection" };
}

async function handleReviewEmergencyVoice(
  ctx: OnboardingActionContext,
): Promise<OnboardingHandlerResult> {
  const result = await reviewWorkspaceEmergencyVoice({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
  });
  return adaptRouteDataResult(result);
}

async function handleProvisionA2p(ctx: OnboardingActionContext): Promise<OnboardingHandlerResult> {
  const nextState = await provisionWorkspaceA2P({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.user.id,
  });
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
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

  await updateWorkspaceRcsOnboarding({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
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
  await persistWorkspaceOnboardingState({
    supabaseClient: ctx.supabaseClient,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    updates: { currentStep: "launch_checks" },
  });
  return {
    kind: "payload",
    data: { success: "RCS onboarding state updated." },
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
} satisfies Record<OnboardingActionName, (ctx: OnboardingActionContext) => Promise<OnboardingHandlerResult>>;

export async function runOnboardingAction(
  supabaseClient: SupabaseClient<Database>,
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

  const admin = await requireOnboardingAdmin(supabaseClient, userId, workspaceId);
  if (!admin.ok) {
    return admin;
  }

  const ctx: OnboardingActionContext = {
    input,
    workspaceId,
    supabaseClient,
    user: { id: userId },
    actorUserId: userId,
  };

  try {
    const result = await ONBOARDING_ACTION_HANDLERS[actionName](ctx);
    const detail = await getWorkspaceOnboardingDetail(supabaseClient, userId, workspaceId);
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

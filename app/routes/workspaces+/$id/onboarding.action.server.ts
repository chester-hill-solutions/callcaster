import {
  buildOnboardingStepsForState,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  createWorkspaceTwilioInstance,
  getUserRole,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
  updateWorkspacePhoneNumber,
} from "@/lib/database.server";
import {
  TWILIO_RCS_PROVIDER,
  hydrateWorkspaceRcsOnboardingState,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { data as routeData, redirect } from "react-router";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { verifyAuth } from "@/lib/supabase.server";
import type {
  User,
  WorkspaceMessagingBusinessProfile,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";
import type { ActionFunctionArgs } from "react-router";

export type OnboardingActionData = {
  success?: string;
  error?: string;
};

const CHANNEL_OPTIONS: Array<{
  id: WorkspaceOnboardingChannel;
  label: string;
  description: string;
}> = [
  {
    id: "a2p10dlc",
    label: "A2P 10DLC",
    description: "Register US application-to-person SMS campaigns and sender trust.",
  },
  {
    id: "rcs",
    label: "RCS for business",
    description: "Track rich-messaging readiness while the provider path matures.",
  },
  {
    id: "voice_compliance",
    label: "Voice emergency compliance",
    description: "Track emergency address and emergency-capable number readiness.",
  },
];

function asWorkspaceOnboardingStatus(value: FormDataEntryValue | null): WorkspaceOnboardingStatus {
  switch (value) {
    case "not_started":
    case "collecting_business":
    case "provisioning":
    case "submitting":
    case "in_review":
    case "approved":
    case "rejected":
    case "live":
      return value;
    default:
      return "in_review";
  }
}

function readSelectedChannels(formData: FormData): WorkspaceOnboardingChannel[] {
  const values = formData.getAll("selectedChannels").map(String);
  return values.filter((value): value is WorkspaceOnboardingChannel =>
    CHANNEL_OPTIONS.some((option) => option.id === value),
  );
}

function buildBusinessProfile(formData: FormData): WorkspaceMessagingBusinessProfile {
  const sampleMessages = String(formData.get("sampleMessages") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    legalBusinessName: String(formData.get("legalBusinessName") ?? ""),
    businessType: String(formData.get("businessType") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    privacyPolicyUrl: String(formData.get("privacyPolicyUrl") ?? ""),
    termsOfServiceUrl: String(formData.get("termsOfServiceUrl") ?? ""),
    supportEmail: String(formData.get("supportEmail") ?? ""),
    supportPhone: String(formData.get("supportPhone") ?? ""),
    useCaseSummary: String(formData.get("useCaseSummary") ?? ""),
    optInWorkflow: String(formData.get("optInWorkflow") ?? ""),
    optInKeywords: String(formData.get("optInKeywords") ?? ""),
    optOutKeywords: String(formData.get("optOutKeywords") ?? ""),
    helpKeywords: String(formData.get("helpKeywords") ?? ""),
    sampleMessages,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasVoiceCapability(capabilities: unknown) {
  return isRecord(capabilities) && (capabilities.voice === true || capabilities.voice === "true");
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    return routeData<OnboardingActionData>({ error: "Workspace ID is required." }, { status: 400 });
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const role = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
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

  try {
    if (actionName === "save_channels") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
      });
      const selectedChannels = readSelectedChannels(formData);
      let nextState = mergeWorkspaceMessagingOnboardingState(current, {
        selectedChannels,
        status: "collecting_business",
        currentStep: "messaging_service",
        emergencyVoice: selectedChannels.includes("voice_compliance")
          ? current.emergencyVoice
          : {
              ...current.emergencyVoice,
              enabled: false,
            },
      });
      nextState = hydrateWorkspaceRcsOnboardingState(nextState);
      nextState.steps = buildOnboardingStepsForState(nextState);
      await updateWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
        updates: nextState,
        actorUserId: user.id,
      });
      return routeData<OnboardingActionData>({ success: "Onboarding channels updated." });
    }

    if (actionName === "bootstrap_messaging_service") {
      await ensureWorkspaceTwilioBootstrap({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
      });
      return routeData<OnboardingActionData>({ success: "Messaging Service bootstrap completed." });
    }

    if (actionName === "save_business_profile") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
      });
      const businessProfile = buildBusinessProfile(formData);
      const addressStreet = String(formData.get("addressStreet") ?? "");
      const addressCity = String(formData.get("addressCity") ?? "");
      const addressRegion = String(formData.get("addressRegion") ?? "");
      const addressPostalCode = String(formData.get("addressPostalCode") ?? "");
      const addressCountryCode = String(formData.get("addressCountryCode") ?? "US");
      const hasEmergencyAddress = Boolean(
        addressStreet.trim() &&
        addressCity.trim() &&
        addressRegion.trim() &&
        addressPostalCode.trim(),
      );
      let nextState = mergeWorkspaceMessagingOnboardingState(current, {
        businessProfile,
        status: "collecting_business",
        currentStep: "use_case",
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
      });
      nextState = hydrateWorkspaceRcsOnboardingState(nextState);
      nextState.steps = buildOnboardingStepsForState(nextState);
      await updateWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
        updates: nextState,
        actorUserId: user.id,
      });
      return routeData<OnboardingActionData>({ success: "Business and compliance details saved." });
    }

    if (actionName === "review_emergency_voice") {
      const [current, workspacePhoneNumbers] = await Promise.all([
        getWorkspaceMessagingOnboardingState({
          supabaseClient,
          workspaceId,
        }),
        getWorkspacePhoneNumbers({
          supabaseClient,
          workspaceId,
        }),
      ]);
      const address = current.emergencyVoice.address;
      const customerName = address.customerName.trim() || current.businessProfile.legalBusinessName.trim();
      const countryCode = address.countryCode.trim().toUpperCase() || "US";

      if (
        !address.street.trim() ||
        !address.city.trim() ||
        !address.region.trim() ||
        !address.postalCode.trim() ||
        !customerName
      ) {
        return routeData<OnboardingActionData>(
          { error: "Save a complete emergency service address before running voice review." },
          { status: 400 },
        );
      }

      try {
        const twilio = (await createWorkspaceTwilioInstance({
          supabase: supabaseClient,
          workspace_id: workspaceId,
        })) as any;
        const twilioAddress =
          address.addressSid && typeof twilio.addresses === "function"
            ? await twilio.addresses(address.addressSid).update({
                customerName,
                street: address.street.trim(),
                city: address.city.trim(),
                region: address.region.trim(),
                postalCode: address.postalCode.trim(),
                isoCountry: countryCode,
                friendlyName: `${customerName} emergency address`,
                emergencyEnabled: true,
              })
            : await twilio.addresses.create({
                customerName,
                street: address.street.trim(),
                city: address.city.trim(),
                region: address.region.trim(),
                postalCode: address.postalCode.trim(),
                isoCountry: countryCode,
                friendlyName: `${customerName} emergency address`,
                emergencyEnabled: true,
              });

        const eligiblePhoneNumbers: string[] = [];
        const ineligibleCallerIds: string[] = [];
        const now = new Date().toISOString();

        for (const workspaceNumber of workspacePhoneNumbers.data ?? []) {
          const phoneNumber = workspaceNumber?.phone_number ?? null;
          if (!phoneNumber) {
            continue;
          }

          const baseCapabilities = isRecord(workspaceNumber.capabilities)
            ? workspaceNumber.capabilities
            : {};
          const isRentedVoiceNumber =
            workspaceNumber?.type === "rented" && hasVoiceCapability(workspaceNumber.capabilities);

          if (!isRentedVoiceNumber) {
            ineligibleCallerIds.push(phoneNumber);
            if (workspaceNumber?.id != null) {
              await updateWorkspacePhoneNumber({
                supabaseClient,
                workspaceId,
                numberId: workspaceNumber.id,
                updates: {
                  capabilities: {
                    ...baseCapabilities,
                    emergency_address_status: "validated",
                    emergency_address_sid: twilioAddress.sid ?? null,
                    emergency_eligible: false,
                    emergency_compliance_status: "approved",
                  },
                },
              });
            }
            continue;
          }

          try {
            const [incomingNumber] = await twilio.incomingPhoneNumbers.list({
              phoneNumber,
              limit: 1,
            });

            if (!incomingNumber?.sid) {
              ineligibleCallerIds.push(phoneNumber);
            } else {
              await twilio.incomingPhoneNumbers(incomingNumber.sid).update({
                emergencyAddressSid: twilioAddress.sid,
              });
              eligiblePhoneNumbers.push(phoneNumber);
            }
          } catch {
            ineligibleCallerIds.push(phoneNumber);
          }

          if (workspaceNumber?.id != null) {
            await updateWorkspacePhoneNumber({
              supabaseClient,
              workspaceId,
              numberId: workspaceNumber.id,
              updates: {
                capabilities: {
                  ...baseCapabilities,
                  emergency_address_status: "validated",
                  emergency_address_sid: twilioAddress.sid ?? null,
                  emergency_eligible: eligiblePhoneNumbers.includes(phoneNumber),
                  emergency_compliance_status:
                    eligiblePhoneNumbers.includes(phoneNumber) ? "live" : "approved",
                },
              },
            });
          }
        }

        let nextState = mergeWorkspaceMessagingOnboardingState(current, {
          currentStep: "launch_checks",
          emergencyVoice: {
            ...current.emergencyVoice,
            enabled: eligiblePhoneNumbers.length > 0,
            status: eligiblePhoneNumbers.length > 0 ? "live" : "approved",
            emergencyEligiblePhoneNumbers: eligiblePhoneNumbers,
            ineligibleCallerIds,
            address: {
              ...current.emergencyVoice.address,
              customerName,
              countryCode,
              addressSid: twilioAddress.sid ?? null,
              status: "validated",
              validationError: null,
              lastValidatedAt: now,
            },
            lastReviewedAt: now,
          },
        });
        nextState = hydrateWorkspaceRcsOnboardingState(nextState);
        nextState.steps = buildOnboardingStepsForState(nextState);
        await updateWorkspaceMessagingOnboardingState({
          supabaseClient,
          workspaceId,
          updates: nextState,
          actorUserId: user.id,
        });

        if (eligiblePhoneNumbers.length === 0) {
          return routeData<OnboardingActionData>({
            success: "Emergency address validated. Add or refresh a rented voice number to finish voice readiness.",
          });
        }

        const ineligibleCount = ineligibleCallerIds.length;
        return routeData<OnboardingActionData>({
          success:
            ineligibleCount > 0
              ? `Emergency voice reviewed. ${eligiblePhoneNumbers.length} number(s) are ready and ${ineligibleCount} still need review.`
              : `Emergency voice reviewed. ${eligiblePhoneNumbers.length} number(s) are emergency-ready.`,
        });
      } catch (error) {
        let failedState = mergeWorkspaceMessagingOnboardingState(current, {
          emergencyVoice: {
            ...current.emergencyVoice,
            enabled: false,
            status: "rejected",
            emergencyEligiblePhoneNumbers: [],
            address: {
              ...current.emergencyVoice.address,
              status: "invalid",
              validationError:
                error instanceof Error ? error.message : "Emergency address validation failed.",
            },
            lastReviewedAt: null,
          },
        });
        failedState = hydrateWorkspaceRcsOnboardingState(failedState);
        failedState.steps = buildOnboardingStepsForState(failedState);
        await updateWorkspaceMessagingOnboardingState({
          supabaseClient,
          workspaceId,
          updates: failedState,
          actorUserId: user.id,
        });
        return routeData<OnboardingActionData>(
          {
            error:
              error instanceof Error ? error.message : "Emergency address validation failed.",
          },
          { status: 500 },
        );
      }
    }

    if (actionName === "provision_a2p") {
      const nextState = await provisionWorkspaceA2P({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
      });
      if (nextState.reviewState.blockingIssues.length > 0) {
        return routeData<OnboardingActionData>({
          error: "A2P submission is blocked until the required onboarding and Trust Hub prerequisites are completed.",
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
      return routeData<OnboardingActionData>({ success: "A2P brand and campaign were submitted for review." });
    }

    if (actionName === "save_rcs") {
      await updateWorkspaceRcsOnboarding({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
        provider: TWILIO_RCS_PROVIDER,
        displayName: String(formData.get("rcsDisplayName") ?? ""),
        publicDescription: String(formData.get("rcsPublicDescription") ?? ""),
        logoImageUrl: String(formData.get("rcsLogoImageUrl") ?? ""),
        bannerImageUrl: String(formData.get("rcsBannerImageUrl") ?? ""),
        accentColor: String(formData.get("rcsAccentColor") ?? ""),
        optInPolicyImageUrl: String(formData.get("rcsOptInPolicyImageUrl") ?? ""),
        useCaseVideoUrl: String(formData.get("rcsUseCaseVideoUrl") ?? ""),
        representativeName: String(formData.get("rcsRepresentativeName") ?? ""),
        representativeTitle: String(formData.get("rcsRepresentativeTitle") ?? ""),
        representativeEmail: String(formData.get("rcsRepresentativeEmail") ?? ""),
        notificationEmail: String(formData.get("rcsNotificationEmail") ?? ""),
        agentId: String(formData.get("rcsAgentId") ?? "").trim() || null,
        senderId: String(formData.get("rcsSenderId") ?? "").trim() || null,
        regions: String(formData.get("rcsRegions") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        notes: String(formData.get("rcsNotes") ?? ""),
        status: asWorkspaceOnboardingStatus(formData.get("rcsStatus")),
      });
      return routeData<OnboardingActionData>({ success: "RCS onboarding state updated." });
    }

    return routeData<OnboardingActionData>({ error: "Unknown onboarding action." }, { status: 400 });
  } catch (error) {
    return routeData<OnboardingActionData>(
      {
        error: error instanceof Error ? error.message : "Onboarding update failed.",
      },
      { status: 500 },
    );
  }
};

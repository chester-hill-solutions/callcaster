import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  isWizardOnboardingStepId,
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
  isRcsOnboardingEnabled,
  stripDisabledRcsChannel,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { data as routeData, redirect } from "react-router";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { verifyAuth } from "@/lib/supabase.server";
import type { User } from "@/lib/types";
import type { ActionFunctionArgs } from "react-router";
import { isRecord } from "@/lib/parse-utils.server";
import { hasVoiceCapability } from "./onboarding/utils";
import type Twilio from "twilio";
import {
  asWorkspaceOnboardingStatus,
  buildBusinessProfile,
  readSelectedChannels,
  type OnboardingActionData,
} from "@/lib/onboarding-actions.server";
export type { OnboardingActionData } from "@/lib/onboarding-actions.server";

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

  async function persistOnboardingState(
    workspaceId: string,
    updates: Parameters<typeof updateWorkspaceMessagingOnboardingState>[0]["updates"],
  ) {
    const phoneNumbers = await getWorkspacePhoneNumbers({
      supabaseClient,
      workspaceId,
    });
    const current = await getWorkspaceMessagingOnboardingState({
      supabaseClient,
      workspaceId,
    });
    const merged = mergeWorkspaceMessagingOnboardingState(current, updates);
    const withSteps = applyOnboardingStepsWithWorkspaceNumbers(
      merged,
      phoneNumbers.data ?? [],
    );
    return updateWorkspaceMessagingOnboardingState({
      supabaseClient,
      workspaceId,
      updates: withSteps,
      actorUserId,
    });
  }

  try {
    if (actionName === "advance_step") {
      const targetStep = String(formData.get("targetStep") ?? "");
      if (!isWizardOnboardingStepId(targetStep)) {
        return routeData<OnboardingActionData>({ error: "Invalid onboarding step." }, { status: 400 });
      }
      await persistOnboardingState(wsId, { currentStep: targetStep });
      return routeData<OnboardingActionData>({ success: "Onboarding step updated." });
    }

    if (actionName === "skip_first_number") {
      await persistOnboardingState(wsId, { currentStep: "provider_provisioning" });
      return routeData<OnboardingActionData>({
        success: "Skipped number rental for now. You can add a number later in Settings.",
      });
    }

    if (actionName === "verify_caller_id") {
      const phoneNumber = String(formData.get("phoneNumber") ?? "");
      const friendlyName = String(formData.get("friendlyName") ?? "");
      if (!phoneNumber.trim() || !friendlyName.trim()) {
        return routeData<OnboardingActionData>(
          { error: "Phone number and caller ID name are required." },
          { status: 400 },
        );
      }
      const { validationRequest } = await startWorkspaceCallerIdVerification({
        supabaseClient,
        workspaceId: wsId,
        phoneNumber,
        friendlyName,
      });
      return routeData<OnboardingActionData>({
        success: "Verification call started. Enter the code when prompted.",
        validationRequest,
      });
    }

    if (actionName === "save_channels") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId: wsId,
      });
      const selectedChannels = stripDisabledRcsChannel(readSelectedChannels(formData));
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
      await persistOnboardingState(wsId, nextState);
      return routeData<OnboardingActionData>({ success: "Onboarding channels updated." });
    }

    if (actionName === "bootstrap_messaging_service") {
      const bootstrap = await ensureWorkspaceTwilioBootstrap({
        supabaseClient,
        workspaceId: wsId,
        actorUserId: user.id,
      });

      if (bootstrap.serviceSid) {
        await persistOnboardingState(wsId, { currentStep: "first_number" });
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

    if (actionName === "save_business_profile") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId: wsId,
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
      });
      nextState = hydrateWorkspaceRcsOnboardingState(nextState);
      await persistOnboardingState(wsId, nextState);
      return routeData<OnboardingActionData>({ success: "Business and compliance details saved." });
    }

    if (actionName === "review_emergency_voice") {
      const [current, workspacePhoneNumbers] = await Promise.all([
        getWorkspaceMessagingOnboardingState({
          supabaseClient,
          workspaceId: wsId,
        }),
        getWorkspacePhoneNumbers({
          supabaseClient,
          workspaceId: wsId,
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
          workspace_id: wsId,
        })) as Twilio.Twilio;
        const addressPayload = {
          customerName,
          street: address.street.trim(),
          city: address.city.trim(),
          region: address.region.trim(),
          postalCode: address.postalCode.trim(),
          isoCountry: countryCode,
          friendlyName: `${customerName} emergency address`,
          emergencyEnabled: true,
        };
        const twilioAddress =
          address.addressSid && typeof twilio.addresses === "function"
            ? await twilio.addresses(address.addressSid).update(addressPayload as never)
            : await twilio.addresses.create(addressPayload as never);

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
                workspaceId: wsId,
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
              workspaceId: wsId,
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
        await persistOnboardingState(wsId, nextState);

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
        await persistOnboardingState(wsId, failedState);
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
        workspaceId: wsId,
        actorUserId: user.id,
      });
      await persistOnboardingState(wsId, { currentStep: "launch_checks" });
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
      if (!isRcsOnboardingEnabled()) {
        return routeData<OnboardingActionData>(
          { error: "RCS onboarding is not available." },
          { status: 400 },
        );
      }

      await updateWorkspaceRcsOnboarding({
        supabaseClient,
        workspaceId: wsId,
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
      await persistOnboardingState(wsId, { currentStep: "launch_checks" });
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

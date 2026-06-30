import {
  createWorkspaceTwilioInstance,
  getWorkspacePhoneNumbers,
  updateWorkspacePhoneNumber,
} from "@/lib/database.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { isObject } from "@/lib/type-safety-utils";
import { hasVoiceCapability } from "@/lib/onboarding/voice-capabilities";
import type { Database } from "@/lib/db-types";
import type Twilio from "twilio";
import type { OnboardingActionData } from "@/lib/onboarding-actions.server";
import { data as routeData } from "react-router";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";

export async function reviewWorkspaceEmergencyVoice(args: {
  workspaceId: string;
  actorUserId: string | null;
}) {
  const { workspaceId, actorUserId } = args;

  const [current, workspacePhoneNumbers] = await Promise.all([
    getWorkspaceMessagingOnboardingState({
      workspaceId,
    }),
    getWorkspacePhoneNumbers({
      workspaceId,
    }),
  ]);

  const address = current.emergencyVoice.address;
  const customerName =
    address.customerName.trim() || current.businessProfile.legalBusinessName.trim();
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
    const twilio = (await createWorkspaceTwilioInstance({       workspace_id: workspaceId,
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

      const baseCapabilities = isObject(workspaceNumber.capabilities)
        ? workspaceNumber.capabilities
        : {};
      const isRentedVoiceNumber =
        workspaceNumber?.type === "rented" && hasVoiceCapability(workspaceNumber.capabilities);

      if (!isRentedVoiceNumber) {
        ineligibleCallerIds.push(phoneNumber);
        if (workspaceNumber?.id != null) {
          await updateWorkspacePhoneNumber({
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
          workspaceId,
          numberId: workspaceNumber.id,
          updates: {
            capabilities: {
              ...baseCapabilities,
              emergency_address_status: "validated",
              emergency_address_sid: twilioAddress.sid ?? null,
              emergency_eligible: eligiblePhoneNumbers.includes(phoneNumber),
              emergency_compliance_status: eligiblePhoneNumbers.includes(phoneNumber)
                ? "live"
                : "approved",
            },
          },
        });
      }
    }

    await persistWorkspaceOnboardingState({
      workspaceId,
      actorUserId,
      updates: {
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
      },
    });

    if (eligiblePhoneNumbers.length === 0) {
      return routeData<OnboardingActionData>({
        success:
          "Emergency address validated. Add or refresh a rented voice number to finish voice readiness.",
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
    await persistWorkspaceOnboardingState({
      workspaceId,
      actorUserId,
      updates: {
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
      },
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

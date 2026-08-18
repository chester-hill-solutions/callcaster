import {
  createWorkspaceTwilioInstance,
  getWorkspacePhoneNumbers,
  updateWorkspacePhoneNumber,
} from "@/lib/database/workspace.server";
import { getWorkspaceMessagingOnboardingState } from "@/lib/messaging-onboarding.server";
import { isObject } from "@/lib/type-safety-utils";
import { hasVoiceCapability } from "@/lib/onboarding/voice-capabilities";
import type { Database } from "@/lib/db-types";
import type Twilio from "twilio";
import { persistWorkspaceOnboardingState } from "@/lib/onboarding/onboarding-persist.server";

export type ReviewWorkspaceEmergencyVoiceResult =
  | { ok: true; success?: string }
  | { ok: false; error: string; status?: number };

export async function reviewWorkspaceEmergencyVoice(args: {
  workspaceId: string;
  actorUserId: string | null;
}): Promise<ReviewWorkspaceEmergencyVoiceResult> {
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
    return {
      ok: false,
      error: "Save a complete emergency service address before running voice review.",
      status: 400,
    };
  }

  // Hoisted so the catch can tell an address-creation failure (nothing applied
  // yet → a reject reset is correct) from a later failure after some number rows
  // were already flipped to emergency-live (→ persist the partial success we
  // achieved, so number capabilities and onboarding state don't disagree).
  const eligiblePhoneNumbers: string[] = [];
  const ineligibleCallerIds: string[] = [];
  const now = new Date().toISOString();
  let addressValidated = false;
  let addressSid: string | null = null;

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
    // The address exists now; a failure past this point is post-address.
    addressValidated = true;
    addressSid = twilioAddress.sid ?? null;

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
      return {
        ok: true,
        success:
          "Emergency address validated. Add or refresh a rented voice number to finish voice readiness.",
      };
    }

    const ineligibleCount = ineligibleCallerIds.length;
    return {
      ok: true,
      success:
        ineligibleCount > 0
          ? `Emergency voice reviewed. ${eligiblePhoneNumbers.length} number(s) are ready and ${ineligibleCount} still need review.`
          : `Emergency voice reviewed. ${eligiblePhoneNumbers.length} number(s) are emergency-ready.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Emergency address validation failed.";

    if (addressValidated) {
      // The Twilio address was created and some number rows may already be
      // emergency-live. Persist the partial success actually achieved rather
      // than wiping it — a blanket reject would leave the number capabilities
      // (emergency_eligible/'live') and onboarding state contradicting each other.
      await persistWorkspaceOnboardingState({
        workspaceId,
        actorUserId,
        updates: {
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
              addressSid,
              status: "validated",
              validationError: null,
              lastValidatedAt: now,
            },
            lastReviewedAt: now,
          },
        },
      });

      return { ok: false, error: message, status: 500 };
    }

    // Address creation itself failed — nothing was applied, so a reject reset
    // is accurate.
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
            validationError: message,
          },
          lastReviewedAt: null,
        },
      },
    });

    return { ok: false, error: message, status: 500 };
  }
}

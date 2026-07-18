import {
  createWorkspaceTwilioInstance,
  getUserRole,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  removeWorkspacePhoneNumber,
  requireWorkspaceAccess,
  updateCallerId,
  updateWorkspacePhoneNumber,
} from "@/lib/database/workspace.server";
import type { Database } from "@/lib/db-types";
import { env } from "@/lib/env.server";
import { startWorkspaceCallerIdVerification } from "@/lib/caller-id-verification.server";
import { logger } from "@/lib/logger.server";
import { MemberRole } from "@/lib/member-role";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import {
  hasCreditsForNumberRental,
  NUMBER_RENTAL_MONTHLY_CREDITS,
} from "@/lib/number-rental";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { attachPhoneNumberToMessagingService } from "@/lib/twilio-bootstrap.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { normalizeInboundRingCount } from "../../shared/inbound-rings";
import { debitAmountFromCredits } from "@/lib/pricing";
import { numberRentalPurchaseKey } from "@/lib/billing-keys";
import { getWorkspaceCredits } from "@/lib/workspace-members-db.server";
import { createTenantDb } from "@/server/tenant-db";
import {
  isNanpTollFreeNumber,
  normalizeAddressRequirement,
  resolveAddressForRequirement,
  type AddressRequirement,
  type CandidateAddress,
} from "@/lib/number-address-requirements";
import { deriveAndPersistWorkspaceThroughput } from "@/lib/database/workspace-twilio-config.server";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database/workspace-twilio-sync.server";
import type { patchNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import type { z } from "zod";
import type { InboundRoutingPresetApplication } from "../../shared/inbound-routing-presets";
import { applyRoutingPresetWithTenantDb } from "@/lib/routing-preset-write.server";

type PatchNumberInput = z.infer<typeof patchNumberBodySchema>;

// Default inbound ring count applied to newly rented numbers (Q59). Distinct
// from `INBOUND_RING_COUNT_DEFAULT` in shared/inbound-rings.ts (which backs
// `normalizeInboundRingCount`'s fallback for missing/invalid values) — this is
// the deliberate first-purchase default, not a parsing fallback.
const FIRST_NUMBER_DEFAULT_RING_COUNT = 3;

async function requireNumbersManager(
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const userRole = await getUserRole({
    user: { id: userId },
    workspaceId,
  });

  if (!userRole || userRole.role === MemberRole.Caller) {
    return {
      ok: false,
      error: "You do not have permission to manage phone numbers",
      status: 403,
    };
  }

  return { ok: true };
}

export async function listWorkspaceNumbers(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    user: { id: userId },
    workspaceId,
  });

  const { data, error } = await getWorkspacePhoneNumbers({
    workspaceId,
  });

  if (error) {
    logger.error("listWorkspaceNumbers error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, numbers: data ?? [] };
}

export async function purchaseWorkspaceNumber(
  userId: string,
  workspaceId: string,
  phoneNumber: string,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    const { data: users, error: usersError } = await getWorkspaceUsers({
      workspaceId,
    });
    if (usersError) throw usersError;
    if (!users) {
      return {
        ok: false as const,
        error: "No users found for workspace",
        status: 404,
      };
    }

    const owner = users.find((u) => u.user_workspace_role === "owner");
    const workspaceCredits = (await getWorkspaceCredits(workspaceId)) ?? 0;

    if (!hasCreditsForNumberRental(workspaceCredits)) {
      return {
        ok: false as const,
        error: "Insufficient credits for number rental",
        status: 402,
        creditsError: true as const,
      };
    }

    const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
    const onboarding = await getWorkspaceMessagingOnboardingState({
      workspaceId,
    });

    const { data: workspaceInfo } = await getWorkspaceInfo({ workspaceId });
    const workspaceName = workspaceInfo?.name ?? workspaceId;

    // Attach a validated emergency (E911) address SID when we have one so the
    // number is E911-provisioned at purchase time.
    const validatedEmergencyAddressSid =
      onboarding.emergencyVoice.address.status === "validated"
        ? onboarding.emergencyVoice.address.addressSid ?? undefined
        : undefined;

    // TODO(Q43): auto-apply `addressRequirements` when the number's regulation
    // requires a registered address. Deferred: the Twilio SDK's create options
    // do not expose a clean typed field here, so we set the emergency address
    // SID only and leave regulatory address-requirement handling to a follow-up.
    const number = await withTwilioRetry(
      () =>
        twilio.incomingPhoneNumbers.create({
          phoneNumber,
          friendlyName: `${workspaceName} / ${phoneNumber}`,
          // SMS delivery status (caller-ID verification keeps /api/caller-id/status).
          statusCallback: `${env.BASE_URL()}/api/sms/status`,
          statusCallbackMethod: "POST",
          voiceUrl: `${env.BASE_URL()}/api/inbound`,
          voiceMethod: "POST",
          smsUrl: `${env.BASE_URL()}/api/inbound-sms`,
          smsMethod: "POST",
          ...(validatedEmergencyAddressSid
            ? { emergencyAddressSid: validatedEmergencyAddressSid }
            : {}),
        }),
      { workspaceId, operation: "incomingPhoneNumbers.create" },
    );

    let messagingServiceAttachError: string | undefined;
    let messagingServiceAttached = true;

    if (onboarding.messagingService.serviceSid && number.sid) {
      try {
        await attachPhoneNumberToMessagingService(
          twilio,
          onboarding.messagingService.serviceSid,
          number.sid,
          { workspaceId, operation: "messagingService.phoneNumbers.create" },
        );
      } catch (attachError: unknown) {
        messagingServiceAttached = false;
        messagingServiceAttachError = twilioErrorUserMessage(attachError);
        logger.error("Error attaching number to Messaging Service:", attachError);
      }
    }

    const emergencyEligible =
      Boolean(number.capabilities.voice) &&
      onboarding.emergencyVoice.address.status === "validated";

    const tdb = createTenantDb(workspaceId);
    const [newNumber] = await tdb.workspace_number.insert({
      friendly_name: number.friendlyName,
      phone_number: number.phoneNumber,
      twilio_phone_number_sid: number.sid ?? null,
      capabilities: {
        verification_status:
          number.capabilities.mms &&
          number.capabilities.sms &&
          number.capabilities.voice
            ? "success"
            : "pending",
        emergency_address_status: onboarding.emergencyVoice.address.status,
        emergency_address_sid: onboarding.emergencyVoice.address.addressSid,
        emergency_eligible: emergencyEligible,
        emergency_compliance_status: onboarding.emergencyVoice.status,
        ...number.capabilities,
      },
      inbound_action: owner?.username ?? null,
      type: "rented",
      created_at: new Date().toISOString(),
      // Q45/Q59: handset off, ring count 3 by default for a freshly rented
      // number; owners can change both from the numbers table or the
      // first-number onboarding step.
      handset_enabled: false,
      inbound_ring_count: FIRST_NUMBER_DEFAULT_RING_COUNT,
    });

    if (!newNumber) {
      throw new Error("Failed to insert workspace number");
    }

    const mergedOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
      messagingService: {
        ...onboarding.messagingService,
        attachedSenderPhoneNumbers: messagingServiceAttached
          ? Array.from(
              new Set([
                ...onboarding.messagingService.attachedSenderPhoneNumbers,
                number.phoneNumber,
              ]),
            )
          : onboarding.messagingService.attachedSenderPhoneNumbers,
        lastError:
          messagingServiceAttachError ?? onboarding.messagingService.lastError,
      },
      emergencyVoice: {
        ...onboarding.emergencyVoice,
        emergencyEligiblePhoneNumbers: emergencyEligible
          ? Array.from(
              new Set([
                ...onboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
                number.phoneNumber,
              ]),
            )
          : onboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
      },
      currentStep:
        onboarding.currentStep === "first_number"
          ? "provider_provisioning"
          : onboarding.currentStep,
    });

    const { data: workspacePhoneNumbers } = await getWorkspacePhoneNumbers({
      workspaceId,
    });
    const nextOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
      mergedOnboarding,
      workspacePhoneNumbers ?? [newNumber],
    );
    await updateWorkspaceMessagingOnboardingState({
      workspaceId,
      updates: nextOnboarding,
      actorUserId: owner?.id ?? null,
    });

    // Q39: re-derive smsSenderClass/smsTargetMps from the updated number
    // inventory now that this purchase changed it. Best-effort — a failure
    // here shouldn't fail the purchase itself.
    try {
      await deriveAndPersistWorkspaceThroughput({ workspaceId });
    } catch (throughputError) {
      logger.error(
        "Failed to auto-derive workspace throughput after number purchase",
        throughputError,
      );
    }

    // Q60: kick off a Twilio portal snapshot sync once this workspace's first
    // number lands, so the numbers/throughput inventory is fresh without
    // waiting for the next scheduled/admin-triggered sync. Best-effort.
    const isFirstWorkspaceNumber = (workspacePhoneNumbers ?? [newNumber]).length <= 1;
    if (isFirstWorkspaceNumber) {
      try {
        await syncWorkspaceTwilioSnapshot({ workspaceId });
      } catch (syncError) {
        logger.error(
          "Failed to sync Twilio portal snapshot after first number purchase",
          syncError,
        );
      }
    }

    await insertTransactionHistoryIdempotent({
      workspaceId,
      type: "DEBIT",
      amount: debitAmountFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS),
      note: "Rented number - " + number.friendlyName,
      idempotencyKey: numberRentalPurchaseKey(workspaceId, number.sid),
    });

    const partialSuccess =
      !messagingServiceAttached &&
      Boolean(onboarding.messagingService.serviceSid);

    return {
      ok: true as const,
      number: newNumber,
      messagingServiceAttached,
      messagingServiceAttachError,
      partialSuccess,
      status: messagingServiceAttached ? 201 : 207,
    };
  } catch (error) {
    logger.error("Failed to register number", error);
    return {
      ok: false as const,
      error: twilioErrorUserMessage(error),
      status: 500,
    };
  }
}

export async function patchWorkspaceNumber(
  userId: string,
  workspaceId: string,
  numberId: string,
  input: PatchNumberInput,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const updates: Record<string, unknown> = {};
  if (input.inbound_action !== undefined) {
    updates.inbound_action = input.inbound_action;
  }
  if (input.inbound_audio !== undefined) {
    updates.inbound_audio = input.inbound_audio;
  }
  if (input.inbound_ring_count !== undefined) {
    updates.inbound_ring_count = normalizeInboundRingCount(input.inbound_ring_count);
  }
  if (input.inbound_queue_id !== undefined) {
    updates.inbound_queue_id = input.inbound_queue_id;
  }
  if (input.inbound_script_id !== undefined) {
    updates.inbound_script_id = input.inbound_script_id;
  }
  if (input.handset_enabled !== undefined) {
    updates.handset_enabled = input.handset_enabled;
  }
  if (input.friendly_name !== undefined) {
    updates.friendly_name = input.friendly_name;
  }

  const { data: number, error } = await updateWorkspacePhoneNumber({
    numberId,
    workspaceId,
    updates,
  });

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  if (input.friendly_name !== undefined && number) {
    const callerIdResult = await updateCallerId({
      workspaceId,
      number,
      friendly_name: input.friendly_name,
    });
    if (callerIdResult?.error) {
      return {
        ok: false as const,
        error: String(callerIdResult.error),
        status: 500,
      };
    }
  }

  return { ok: true as const, number };
}

/**
 * Applies a canonical inbound routing preset in one tenant-scoped update.
 * Building the complete patch before touching the database guarantees that
 * validation failures cannot leave a partially-updated route.
 */
export async function applyWorkspaceNumberRoutingPreset(
  userId: string,
  workspaceId: string,
  numberId: string,
  application: InboundRoutingPresetApplication,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    const tdb = createTenantDb(workspaceId);
    return await applyRoutingPresetWithTenantDb(
      tdb,
      numberId,
      application,
    );
  } catch (error) {
    logger.error("applyWorkspaceNumberRoutingPreset error", error);
    return {
      ok: false as const,
      error: "Failed to apply routing preset",
      status: 500,
    };
  }
}

export async function deleteWorkspaceNumber(
  userId: string,
  workspaceId: string,
  numberId: string,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const { error } = await removeWorkspacePhoneNumber({
    numberId: BigInt(numberId),
    workspaceId,
  });

  if (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove phone number";
    return { ok: false as const, error: message, status: 500 };
  }

  return { ok: true as const };
}

export async function verifyWorkspaceCallerId(
  userId: string,
  workspaceId: string,
  phoneNumber: string,
  friendlyName: string,
) {
  const access = await requireNumbersManager(userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    const { validationRequest, numberRequest } =
      await startWorkspaceCallerIdVerification({
        workspaceId,
        phoneNumber,
        friendlyName,
      });

    return {
      ok: true as const,
      validationRequest,
      numberRequest,
    };
  } catch (error) {
    logger.error("verifyWorkspaceCallerId error", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to verify caller ID",
      status: 500,
    };
  }
}

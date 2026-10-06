import {
  cancelNumberPurchase, finalizeNumberPurchase, numberPurchaseProviderMarker,
  recordNumberPurchaseProvider, reserveNumberPurchase, startNumberPurchase, type NumberPurchase,
} from "@/lib/number-purchase-reservation.server";
import {
  compensateNumberPurchase, isDefiniteNumberPurchaseRejection, retainNumberPurchaseForRecovery,
} from "@/lib/number-purchase-recovery.server";
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
import { attachPhoneNumberToMessagingService } from "@/lib/twilio-bootstrap.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { normalizeInboundRingCount } from "../../shared/inbound-rings";
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

  let purchase: NumberPurchase | undefined;
  let providerSid: string | undefined;
  let providerAttemptStarted = false;
  let purchaseCommitted = false;
  let recoveryPending = false;
  let purchaseTwilio: Awaited<ReturnType<typeof createWorkspaceTwilioInstance>> | undefined;

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
    const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
    purchaseTwilio = twilio;
    const onboarding = await getWorkspaceMessagingOnboardingState({
      workspaceId,
    });

    const address = onboarding.emergencyVoice.address;
    const hasServiceAddress = Boolean(
      address.street.trim() &&
        address.city.trim() &&
        address.region.trim() &&
        address.postalCode.trim(),
    );
    if (!hasServiceAddress) {
      return {
        ok: false as const,
        error:
          "Add a service address before renting a phone number.",
        status: 400,
      };
    }

    const { data: workspaceInfo } = await getWorkspaceInfo({ workspaceId });
    const workspaceName = workspaceInfo?.name ?? workspaceId;
    const callbackBaseUrl = env.BASE_URL();
    if (!twilio.accountSid) throw new Error("Workspace provider account is missing");
    const reservation = await reserveNumberPurchase({ workspaceId, actorUserId: userId, phoneNumber, accountSid: twilio.accountSid });
    if (!reservation.ok) return reservation;
    const currentPurchase = reservation.purchase;
    purchase = currentPurchase;
    const friendlyName = `${workspaceName} / ${phoneNumber}`;
    await startNumberPurchase(purchase);
    providerAttemptStarted = true;

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
          friendlyName: `${phoneNumber} ${numberPurchaseProviderMarker(currentPurchase)}`,
          // SMS delivery status (caller-ID verification keeps /api/caller-id/status).
          statusCallback: `${callbackBaseUrl}/api/sms/status`,
          statusCallbackMethod: "POST",
          voiceUrl: `${callbackBaseUrl}/api/inbound`,
          voiceMethod: "POST",
          smsUrl: `${callbackBaseUrl}/api/inbound-sms`,
          smsMethod: "POST",
          ...(validatedEmergencyAddressSid
            ? { emergencyAddressSid: validatedEmergencyAddressSid }
            : {}),
        }),
      { workspaceId, operation: "incomingPhoneNumbers.create", maxAttempts: 1 },
    );

    if (number.accountSid !== currentPurchase.account_sid || number.phoneNumber !== phoneNumber || !number.sid ||
        !number.friendlyName.includes(numberPurchaseProviderMarker(currentPurchase))) {
      throw new Error("Provider returned a different number or account");
    }
    providerSid = number.sid;
    await recordNumberPurchaseProvider(purchase, providerSid);

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

    const { newNumber, workspacePhoneNumbers } = await finalizeNumberPurchase(purchase, providerSid, "Rented number - " + friendlyName, async (tx) => {
      const tdb = createTenantDb(workspaceId, tx);
      const currentOnboarding = await getWorkspaceMessagingOnboardingState({ workspaceId, transaction: tx });
      const [newNumber] = await tdb.workspace_number.insert({
        friendly_name: friendlyName,
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

      const mergedOnboarding = mergeWorkspaceMessagingOnboardingState(currentOnboarding, {
        messagingService: {
          ...currentOnboarding.messagingService,
          attachedSenderPhoneNumbers: messagingServiceAttached
            ? Array.from(
                new Set([
                  ...currentOnboarding.messagingService.attachedSenderPhoneNumbers,
                  number.phoneNumber,
                ]),
              )
            : currentOnboarding.messagingService.attachedSenderPhoneNumbers,
          lastError:
            messagingServiceAttachError ?? currentOnboarding.messagingService.lastError,
        },
        emergencyVoice: {
          ...currentOnboarding.emergencyVoice,
          emergencyEligiblePhoneNumbers: emergencyEligible
            ? Array.from(
                new Set([
                  ...currentOnboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
                  number.phoneNumber,
                ]),
              )
            : currentOnboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
        },
        currentStep:
          currentOnboarding.currentStep === "first_number"
            ? "provider_provisioning"
            : currentOnboarding.currentStep,
      });

      const { data: workspacePhoneNumbers } = await getWorkspacePhoneNumbers({
        workspaceId, tdb,
      });
      const nextOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
        mergedOnboarding,
        workspacePhoneNumbers ?? [newNumber],
      );
      await updateWorkspaceMessagingOnboardingState({
        workspaceId,
        updates: nextOnboarding,
        actorUserId: owner?.id ?? null,
        transaction: tx,
      });

      return { newNumber, workspacePhoneNumbers };
    });
    purchaseCommitted = true;

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
    if (purchase && !purchaseCommitted) {
      try {
        if (!providerAttemptStarted || (!providerSid && isDefiniteNumberPurchaseRejection(error))) {
          await cancelNumberPurchase(purchase);
        } else if (purchaseTwilio && !await compensateNumberPurchase(purchase, purchaseTwilio, providerSid)) {
          recoveryPending = true;
          await retainNumberPurchaseForRecovery(purchase);
        }
      } catch (recoveryError) {
        recoveryPending = true;
        logger.error("Number purchase compensation failed", recoveryError);
        await retainNumberPurchaseForRecovery(purchase);
      }
    }
    logger.error("Failed to register number", error);
    return {
      ok: false as const,
      error: recoveryPending
        ? "This number purchase needs verification. Do not retry this number yet."
        : twilioErrorUserMessage(error),
      status: recoveryPending ? 409 : 500,
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

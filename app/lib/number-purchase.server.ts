import type Twilio from "twilio";
import {
  cancelNumberPurchase,
  finalizeNumberPurchase,
  numberPurchaseProviderMarker,
  recordNumberPurchaseProvider,
  reserveNumberPurchase,
  startNumberPurchase,
  type NumberPurchase,
} from "@/server/number-purchase-reservation.server";
import {
  compensateNumberPurchase,
  isDefiniteNumberPurchaseRejection,
  retainNumberPurchaseForRecovery,
} from "@/lib/number-purchase-recovery.server";
import {
  createWorkspaceTwilioInstance,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
} from "@/lib/database/workspace.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { attachPhoneNumberToMessagingService } from "@/lib/twilio-bootstrap.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import { createTenantDb } from "@/server/tenant-db";
import { deriveAndPersistWorkspaceThroughput } from "@/lib/database/workspace-twilio-config.server";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database/workspace-twilio-sync.server";

// First rentals start with three rings, independently of the generic input fallback.
const FIRST_NUMBER_DEFAULT_RING_COUNT = 3;
type PreparedPurchase = Extract<
  Awaited<ReturnType<typeof preparePurchase>>,
  { ok: true }
>;
type ProviderNumber = Awaited<
  ReturnType<Twilio.Twilio["incomingPhoneNumbers"]["create"]>
>;

async function preparePurchase(workspaceId: string) {
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
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: workspaceId,
  });
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
      error: "Add a service address before renting a phone number.",
      status: 400,
    };
  }

  const { data: workspaceInfo } = await getWorkspaceInfo({ workspaceId });
  const workspaceName = workspaceInfo?.name ?? workspaceId;
  const callbackBaseUrl = env.BASE_URL();
  if (!twilio.accountSid)
    throw new Error("Workspace provider account is missing");
  return {
    ok: true as const,
    owner,
    twilio,
    onboarding,
    workspaceName,
    callbackBaseUrl,
  };
}

function purchaseFailure(error: unknown) {
  logger.error("Failed to register number", error);
  return {
    ok: false as const,
    error: twilioErrorUserMessage(error),
    status: 500,
  };
}

async function recoverPurchase(
  purchase: NumberPurchase,
  twilio: Twilio.Twilio,
  error: unknown,
  providerSid?: string,
) {
  try {
    if (await compensateNumberPurchase(purchase, twilio, providerSid))
      return purchaseFailure(error);
  } catch (recoveryError) {
    logger.error("Number purchase compensation failed", recoveryError);
  }
  await retainNumberPurchaseForRecovery(purchase);
  return {
    ok: false as const,
    error:
      "This number purchase needs verification. Do not retry this number yet.",
    status: 409,
  };
}

async function createProviderNumber(
  purchase: NumberPurchase,
  phoneNumber: string,
  prepared: PreparedPurchase,
) {
  const { twilio, onboarding, callbackBaseUrl } = prepared;
  const workspaceId = purchase.workspace;
  try {
    // Attach a validated emergency (E911) address SID when we have one so the
    // number is E911-provisioned at purchase time.
    const validatedEmergencyAddressSid =
      onboarding.emergencyVoice.address.status === "validated"
        ? (onboarding.emergencyVoice.address.addressSid ?? undefined)
        : undefined;

    // TODO(Q43): auto-apply `addressRequirements` when the number's regulation
    // requires a registered address. Deferred: the Twilio SDK's create options
    // do not expose a clean typed field here, so we set the emergency address
    // SID only and leave regulatory address-requirement handling to a follow-up.
    const number = await withTwilioRetry(
      () =>
        twilio.incomingPhoneNumbers.create({
          phoneNumber,
          friendlyName: `${phoneNumber} ${numberPurchaseProviderMarker(purchase)}`,
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

    if (
      number.accountSid !== purchase.account_sid ||
      number.phoneNumber !== phoneNumber ||
      !number.sid ||
      !number.friendlyName.includes(numberPurchaseProviderMarker(purchase))
    ) {
      throw new Error("Provider returned a different number or account");
    }
    return { ok: true as const, number };
  } catch (error) {
    if (isDefiniteNumberPurchaseRejection(error)) {
      try {
        await cancelNumberPurchase(purchase);
        return purchaseFailure(error);
      } catch (cancelError) {
        logger.error("Number purchase cancellation failed", cancelError);
      }
    }
    return recoverPurchase(purchase, twilio, error);
  }
}

async function settlePurchase(
  purchase: NumberPurchase,
  number: ProviderNumber,
  prepared: PreparedPurchase,
) {
  const workspaceId = purchase.workspace;
  const { twilio, onboarding, owner, workspaceName } = prepared;
  const friendlyName = `${workspaceName} / ${purchase.phone_number}`;
  try {
    await recordNumberPurchaseProvider(purchase, number.sid);

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
        logger.error(
          "Error attaching number to Messaging Service:",
          attachError,
        );
      }
    }

    const emergencyEligible =
      Boolean(number.capabilities.voice) &&
      onboarding.emergencyVoice.address.status === "validated";

    const { newNumber, workspacePhoneNumbers } = await finalizeNumberPurchase(
      purchase,
      number.sid,
      "Rented number - " + friendlyName,
      async (tx) => {
        const tdb = createTenantDb(workspaceId, tx);
        const currentOnboarding = await getWorkspaceMessagingOnboardingState({
          workspaceId,
          transaction: tx,
        });
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

        const mergedOnboarding = mergeWorkspaceMessagingOnboardingState(
          currentOnboarding,
          {
            messagingService: {
              ...currentOnboarding.messagingService,
              attachedSenderPhoneNumbers: messagingServiceAttached
                ? Array.from(
                    new Set([
                      ...currentOnboarding.messagingService
                        .attachedSenderPhoneNumbers,
                      number.phoneNumber,
                    ]),
                  )
                : currentOnboarding.messagingService.attachedSenderPhoneNumbers,
              lastError:
                messagingServiceAttachError ??
                currentOnboarding.messagingService.lastError,
            },
            emergencyVoice: {
              ...currentOnboarding.emergencyVoice,
              emergencyEligiblePhoneNumbers: emergencyEligible
                ? Array.from(
                    new Set([
                      ...currentOnboarding.emergencyVoice
                        .emergencyEligiblePhoneNumbers,
                      number.phoneNumber,
                    ]),
                  )
                : currentOnboarding.emergencyVoice
                    .emergencyEligiblePhoneNumbers,
            },
            currentStep:
              currentOnboarding.currentStep === "first_number"
                ? "provider_provisioning"
                : currentOnboarding.currentStep,
          },
        );

        const { data: workspacePhoneNumbers } = await getWorkspacePhoneNumbers({
          workspaceId,
          tdb,
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
      },
    );
    const partialSuccess =
      !messagingServiceAttached &&
      Boolean(onboarding.messagingService.serviceSid);

    return {
      result: {
        ok: true as const,
        number: newNumber,
        messagingServiceAttached,
        messagingServiceAttachError,
        partialSuccess,
        status: messagingServiceAttached ? 201 : 207,
      },
      isFirstWorkspaceNumber:
        (workspacePhoneNumbers ?? [newNumber]).length <= 1,
    };
  } catch (error) {
    return {
      result: await recoverPurchase(purchase, twilio, error, number.sid),
      isFirstWorkspaceNumber: false,
    };
  }
}

async function refreshPurchasedInventory(
  workspaceId: string,
  isFirstWorkspaceNumber: boolean,
) {
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
}

export async function purchaseNumberForWorkspace(
  userId: string,
  workspaceId: string,
  phoneNumber: string,
) {
  try {
    const prepared = await preparePurchase(workspaceId);
    if (!prepared.ok) return prepared;
    const reserved = await reserveNumberPurchase({
      workspaceId,
      actorUserId: userId,
      phoneNumber,
      accountSid: prepared.twilio.accountSid,
    });
    if (!reserved.ok) return reserved;
    const purchase = reserved.purchase;
    try {
      await startNumberPurchase(purchase);
    } catch (error) {
      try {
        await cancelNumberPurchase(purchase);
        return purchaseFailure(error);
      } catch (cancelError) {
        logger.error("Number purchase cancellation failed", cancelError);
        return recoverPurchase(purchase, prepared.twilio, error);
      }
    }
    const created = await createProviderNumber(purchase, phoneNumber, prepared);
    if (!created.ok) return created;
    const settled = await settlePurchase(purchase, created.number, prepared);
    if (settled.result.ok)
      await refreshPurchasedInventory(
        workspaceId,
        settled.isFirstWorkspaceNumber,
      );
    return settled.result;
  } catch (error) {
    return purchaseFailure(error);
  }
}

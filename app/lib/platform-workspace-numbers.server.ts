import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceTwilioInstance,
  getUserRole,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  removeWorkspacePhoneNumber,
  requireWorkspaceAccess,
  updateCallerId,
  updateWorkspacePhoneNumber,
} from "@/lib/database.server";
import type { Database } from "@/lib/database.types";
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
import type { patchNumberBodySchema } from "@/lib/schemas/api/platform-workspace-admin";
import type { z } from "zod";

type PatchNumberInput = z.infer<typeof patchNumberBodySchema>;

async function requireNumbersManager(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const userRole = await getUserRole({
    supabaseClient,
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
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceAccess({
    supabaseClient,
    user: { id: userId },
    workspaceId,
  });

  const { data, error } = await getWorkspacePhoneNumbers({
    supabaseClient,
    workspaceId,
  });

  if (error) {
    logger.error("listWorkspaceNumbers error", error);
    return { ok: false as const, error: error.message, status: 500 };
  }

  return { ok: true as const, numbers: data ?? [] };
}

export async function purchaseWorkspaceNumber(
  userSupabase: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  phoneNumber: string,
) {
  const access = await requireNumbersManager(userSupabase, userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  try {
    const { data: users, error: usersError } = await getWorkspaceUsers({
      supabaseClient: supabase,
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
    const { data: workspaceCredits, error: workspaceCreditsError } =
      await supabase
        .from("workspace")
        .select("credits")
        .eq("id", workspaceId)
        .single();
    if (workspaceCreditsError) throw workspaceCreditsError;

    if (!hasCreditsForNumberRental(workspaceCredits.credits)) {
      return {
        ok: false as const,
        error: "Insufficient credits for number rental",
        status: 400,
        creditsError: true as const,
      };
    }

    const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id: workspaceId });
    const onboarding = await getWorkspaceMessagingOnboardingState({
      supabaseClient: supabase,
      workspaceId,
    });

    const number = await withTwilioRetry(
      () =>
        twilio.incomingPhoneNumbers.create({
          phoneNumber,
          statusCallback: `${env.BASE_URL()}/api/caller-id/status`,
          statusCallbackMethod: "POST",
          voiceUrl: `${env.BASE_URL()}/api/inbound`,
          smsUrl: `${env.BASE_URL()}/api/inbound-sms`,
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

    const { data: newNumber, error: newNumberError } = await supabase
      .from("workspace_number")
      .insert({
        workspace: workspaceId,
        friendly_name: number.friendlyName,
        phone_number: number.phoneNumber,
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
      })
      .select()
      .single();
    if (newNumberError) throw newNumberError;

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
      supabaseClient: supabase,
      workspaceId,
    });
    const nextOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
      mergedOnboarding,
      workspacePhoneNumbers ?? [newNumber],
    );
    await updateWorkspaceMessagingOnboardingState({
      supabaseClient: supabase,
      workspaceId,
      updates: nextOnboarding,
      actorUserId: owner?.id ?? null,
    });

    await insertTransactionHistoryIdempotent({
      supabase,
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
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  numberId: string,
  input: PatchNumberInput,
) {
  const access = await requireNumbersManager(supabaseClient, userId, workspaceId);
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
    supabaseClient,
    numberId,
    workspaceId,
    updates,
  });

  if (error) {
    return { ok: false as const, error: error.message, status: 500 };
  }

  if (input.friendly_name !== undefined && number) {
    const callerIdResult = await updateCallerId({
      supabaseClient,
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

export async function deleteWorkspaceNumber(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  numberId: string,
) {
  const access = await requireNumbersManager(supabaseClient, userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  const { error } = await removeWorkspacePhoneNumber({
    supabaseClient,
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
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  workspaceId: string,
  phoneNumber: string,
  friendlyName: string,
) {
  const access = await requireNumbersManager(supabaseClient, userId, workspaceId);
  if (!access.ok) {
    return access;
  }

  try {
    const { validationRequest, numberRequest } =
      await startWorkspaceCallerIdVerification({
        supabaseClient,
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

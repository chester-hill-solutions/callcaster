import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { createClient } from '@supabase/supabase-js';
import { createErrorResponse } from "@/lib/errors.server";
import {
  createWorkspaceTwilioInstance,
  getWorkspacePhoneNumbers,
  getWorkspaceUsers,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import { verifyAuth } from "@/lib/supabase.server";
import { twilioErrorUserMessage } from "@/lib/twilio-errors";
import {
  attachPhoneNumberToMessagingService,
} from "@/lib/twilio-bootstrap.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {

    const { supabaseClient: userSupabase, user } = await verifyAuth(request);
    const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
    const formData = await request.formData();
    const phoneNumber = formData.get("phoneNumber") as string;
    const workspace_id = formData.get("workspace_id") as string;
    try {
        await requireWorkspaceAccess({ supabaseClient: userSupabase, user, workspaceId: workspace_id });
        const { data: users, error } = await getWorkspaceUsers({
            supabaseClient: supabase,
            workspaceId: workspace_id,
        });
        if (error) throw error;
        if (!users) {
            return new Response(JSON.stringify({ error: 'No users found for workspace' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        const owner = users.find((user) => user.user_workspace_role === "owner");
        const {data: workspaceCredits, error: workspaceCreditsError} = await supabase.from('workspace').select('credits').eq('id', workspace_id).single();
        if (workspaceCreditsError) throw workspaceCreditsError;
        const credits = workspaceCredits.credits;
        if (credits <= 1000) {
            return new Response(JSON.stringify({ creditsError: true }), {
                headers: {
                    "Content-Type": "application/json"
                },
                status: 400
            })
        }
        const twilio = await createWorkspaceTwilioInstance({ supabase, workspace_id });
        const onboarding = await getWorkspaceMessagingOnboardingState({
            supabaseClient: supabase,
            workspaceId: workspace_id,
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
          { workspaceId: workspace_id, operation: "incomingPhoneNumbers.create" },
        );

        let messagingServiceAttachError: string | undefined;
        let messagingServiceAttached = true;

        if (onboarding.messagingService.serviceSid && number.sid) {
            try {
                await attachPhoneNumberToMessagingService(
                  twilio,
                  onboarding.messagingService.serviceSid,
                  number.sid,
                  { workspaceId: workspace_id, operation: "messagingService.phoneNumbers.create" },
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
            .from('workspace_number')
            .insert({
                workspace: workspace_id,
                friendly_name: number.friendlyName,
                phone_number: number.phoneNumber,
                capabilities: {
                    verification_status:((number.capabilities.mms && number.capabilities.sms && number.capabilities.voice) ? "success" : "pending"),
                    emergency_address_status: onboarding.emergencyVoice.address.status,
                    emergency_address_sid: onboarding.emergencyVoice.address.addressSid,
                    emergency_eligible: emergencyEligible,
                    emergency_compliance_status: onboarding.emergencyVoice.status,
                    ...number.capabilities,
                },
                inbound_action: owner?.username ?? null,
                type: "rented"
            })
            .select().single();
        if (newNumberError) throw newNumberError;

        const mergedOnboarding = mergeWorkspaceMessagingOnboardingState(onboarding, {
            messagingService: {
                ...onboarding.messagingService,
                attachedSenderPhoneNumbers: messagingServiceAttached
                  ? Array.from(new Set([
                      ...onboarding.messagingService.attachedSenderPhoneNumbers,
                      number.phoneNumber,
                  ]))
                  : onboarding.messagingService.attachedSenderPhoneNumbers,
                lastError: messagingServiceAttachError ?? onboarding.messagingService.lastError,
            },
            emergencyVoice: {
                ...onboarding.emergencyVoice,
                emergencyEligiblePhoneNumbers: emergencyEligible
                    ? Array.from(new Set([
                        ...onboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
                        number.phoneNumber,
                    ]))
                    : onboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
            },
            currentStep:
              onboarding.currentStep === "first_number"
                ? "provider_provisioning"
                : onboarding.currentStep,
        });
        const { data: workspacePhoneNumbers } = await getWorkspacePhoneNumbers({
            supabaseClient: supabase,
            workspaceId: workspace_id,
        });
        const nextOnboarding = applyOnboardingStepsWithWorkspaceNumbers(
          mergedOnboarding,
          workspacePhoneNumbers ?? [newNumber],
        );
        await updateWorkspaceMessagingOnboardingState({
            supabaseClient: supabase,
            workspaceId: workspace_id,
            updates: nextOnboarding,
            actorUserId: owner?.id ?? null,
        });
        await insertTransactionHistoryIdempotent({
            supabase,
            workspaceId: workspace_id,
            type: "DEBIT",
            amount: -1000,
            note: "Rented number - " + number.friendlyName,
            idempotencyKey: `number_rent_purchase:${workspace_id}:${number.sid}`,
        });
        return new Response(JSON.stringify({
          newNumber,
          messagingServiceAttached,
          messagingServiceAttachError,
          partialSuccess: !messagingServiceAttached && Boolean(onboarding.messagingService.serviceSid),
        }), {
            headers: {
                "Content-Type": "application/json"
            },
            status: messagingServiceAttached ? 201 : 207
        })
    } catch (error) {
        logger.error('Failed to register number', error);
        return createErrorResponse(
          new Error(twilioErrorUserMessage(error)),
          "Failed to register number",
        );

    }
}

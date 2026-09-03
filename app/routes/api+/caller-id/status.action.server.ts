import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getWorkspacePhoneNumbers } from "@/lib/database/workspace.server";
import { updateWorkspaceNumberCapabilitiesByPhone } from "@/lib/inbound-call-db.server";
import { findWorkspaceIdByTwilioAccountSid } from "@/lib/merge-workspace-twilio-data.server";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  updateMessagingServiceSenders,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { env } from "@/lib/env.server";
import { defineAction } from "@/lib/handler.server";

interface FormData {
  VerificationStatus: string;
  To: string;
  [key: string]: string;
}

interface Capabilities {
  fax: boolean;
  mms: boolean;
  sms: boolean;
  voice: boolean;
  verification_status: string;
  emergency_address_status: string;
  emergency_address_sid: string | null;
  emergency_eligible: boolean;
  emergency_compliance_status: string;
}

export const action = defineAction({
  auth: async ({ request }) => {
    const formData = await request.clone().formData();
    const parsedBody: FormData = Object.fromEntries(formData) as FormData;

    // Each workspace validates a caller ID through its own Twilio subaccount, so
    // the callback's AccountSid identifies the workspace that owns this request.
    // Resolve it up front and validate the signature against that subaccount's
    // token (deterministic, unlike a phone-number lookup that is ambiguous when
    // two workspaces share the number).
    const workspaceId = parsedBody.AccountSid
      ? await findWorkspaceIdByTwilioAccountSid(parsedBody.AccountSid)
      : null;

    const forbidden = await requireTwilioSignature(request, {
      workspaceId: workspaceId ?? undefined,
      phoneNumber: parsedBody.To,
    });
    if (forbidden) return forbidden;

    return { body: parsedBody, workspaceId };
  },
  sideEffects: ["db-write"],
  handler: async ({ auth }) => {
    const { body: parsedBody, workspaceId } = auth;

    try {
      if (
        parsedBody.VerificationStatus === "success" ||
        parsedBody.VerificationStatus === "failed"
      ) {
        if (!workspaceId) {
          // No resolvable workspace: never fall back to a phone-only write, which
          // would touch every workspace sharing this number. Ack so Twilio stops
          // retrying and surface it for investigation.
          logger.warn(
            "caller-id status callback without a resolvable workspace; skipping capability write",
            { to: parsedBody.To },
          );
          return routeData({ skipped: "unresolved_workspace" });
        }
        const capabilities: Capabilities = {
          fax: false,
          mms: parsedBody.VerificationStatus === "success",
          sms: parsedBody.VerificationStatus === "success",
          voice: parsedBody.VerificationStatus === "success",
          verification_status: parsedBody.VerificationStatus,
          emergency_address_status: "not_started",
          emergency_address_sid: null,
          emergency_eligible: false,
          emergency_compliance_status: "not_started",
        };

        const numberRequest = await updateWorkspaceNumberCapabilitiesByPhone(
          parsedBody.To,
          capabilities as unknown as Record<string, unknown>,
          workspaceId,
        );

        if (numberRequest.length === 0) {
          throw new Error("No matching record found");
        }

        if (parsedBody.VerificationStatus === "success") {
          const updatedNumber = numberRequest[0]!;
          const workspaceId = updatedNumber.workspace;
          if (workspaceId) {
            const [current, phoneNumbersResult] = await Promise.all([
              getWorkspaceMessagingOnboardingState({ workspaceId }),
              getWorkspacePhoneNumbers({ workspaceId }),
            ]);
            let nextState = updateMessagingServiceSenders(current, parsedBody.To);
            nextState = applyOnboardingStepsWithWorkspaceNumbers(
              nextState,
              phoneNumbersResult.data ?? [],
            );
            await updateWorkspaceMessagingOnboardingState({
              workspaceId,
              updates: nextState,
              actorUserId: null,
            });
          }
        }

        return routeData(numberRequest[0]);
      }

      return routeData(parsedBody);
    } catch (error) {
      logger.error("Error processing request:", error);
      return routeData(
        { error: "An error occurred while processing the request" },
        { status: 500 },
      );
    }
  },
});

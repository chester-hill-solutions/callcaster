import {
  rejectMissingTwilioSignatureHeader,
  validateTwilioWebhookForPhoneCandidates,
} from "@/lib/twilio-webhook.server";
import { data as routeData } from "react-router";
import { logger } from "@/lib/logger.server";
import { getWorkspacePhoneNumbers } from "@/lib/database.server";
import {
  listWorkspaceNumberTwilioCandidatesByPhone,
  updateWorkspaceNumberCapabilitiesByPhone,
} from "@/lib/inbound-call-db.server";
import {
  applyOnboardingStepsWithWorkspaceNumbers,
  getWorkspaceMessagingOnboardingState,
  updateMessagingServiceSenders,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { env } from "@/lib/env.server";

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

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const missingHeader = rejectMissingTwilioSignatureHeader(request);
  if (missingHeader) {
    return missingHeader;
  }

  const formData = await request.formData();
  const parsedBody: FormData = Object.fromEntries(formData) as FormData;

  const client = createClient(
    env.BASE_URL(),
    env.BASE_URL(),
  );

  try {
    const candidateNumbers = await listWorkspaceNumberTwilioCandidatesByPhone(
      parsedBody.To,
    );

    const isValidTwilioRequest = validateTwilioWebhookForPhoneCandidates({
      request,
      params: parsedBody,
      candidates: candidateNumbers,
    });

    if (!isValidTwilioRequest) {
      return routeData({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    if (
      parsedBody.VerificationStatus === "success" ||
      parsedBody.VerificationStatus === "failed"
    ) {
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
        capabilities,
      );

      if (numberRequest.length === 0) {
        throw new Error("No matching record found");
      }

      if (parsedBody.VerificationStatus === "success") {
        const updatedNumber = numberRequest[0];
        const workspaceId = updatedNumber.workspace;
        if (workspaceId) {
          const [current, phoneNumbersResult] = await Promise.all([
            getWorkspaceMessagingOnboardingState({workspaceId,
            }),
            getWorkspacePhoneNumbers({workspaceId,
            }),
          ]);
          let nextState = updateMessagingServiceSenders(current, parsedBody.To);
          nextState = applyOnboardingStepsWithWorkspaceNumbers(
            nextState,
            phoneNumbersResult.data ?? [],
          );
          await updateWorkspaceMessagingOnboardingState({workspaceId,
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
};

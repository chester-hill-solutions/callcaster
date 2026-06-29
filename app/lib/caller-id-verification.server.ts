import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";

export type CallerIdValidationRequest = {
  accountSid: string;
  callSid: string;
  friendlyName: string;
  phoneNumber: string;
  validationCode: string;
};

export type StartWorkspaceCallerIdVerificationResult = {
  validationRequest: CallerIdValidationRequest;
  numberRequest: Array<{
    id: number;
    created_at: string;
    workspace: string;
    friendly_name: string;
    phone_number: string;
    capabilities: Record<string, unknown>;
  }>;
};

export async function startWorkspaceCallerIdVerification({
  workspaceId,
  phoneNumber,
  friendlyName,
}: {
  supabaseClient?: SupabaseClient;
  workspaceId: string;
  phoneNumber: string;
  friendlyName: string;
}): Promise<StartWorkspaceCallerIdVerificationResult> {
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());

  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: workspaceId,
  });

  const validationRequest = await twilio.validationRequests.create({
    friendlyName,
    phoneNumber,
    statusCallback: `${env.BASE_URL()}/api/caller-id/status`,
  });
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  const { data: numberRequest, error: numberError } = await supabase
    .from("workspace_number")
    .upsert(
      {
        workspace: workspaceId,
        friendly_name: friendlyName,
        phone_number: normalizedPhoneNumber,
        type: "caller_id",
        capabilities: {
          fax: false,
          mms: false,
          sms: false,
          voice: false,
          verification_status: "pending",
          emergency_address_status: "not_started",
          emergency_address_sid: null,
          emergency_eligible: false,
          emergency_compliance_status: "not_started",
        },
      },
      {
        onConflict: "phone_number, workspace",
      },
    )
    .select();

  if (numberError) {
    throw new Error(`Error inserting workspace number: ${numberError.message}`);
  }

  return {
    validationRequest: validationRequest as CallerIdValidationRequest,
    numberRequest: (numberRequest ?? []) as StartWorkspaceCallerIdVerificationResult["numberRequest"],
  };
}

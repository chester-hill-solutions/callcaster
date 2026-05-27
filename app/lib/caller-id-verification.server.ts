import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import Twilio from "twilio";

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

  const { data, error } = await supabase
    .from("workspace")
    .select()
    .eq("id", workspaceId)
    .single();
  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }
  if (!data) {
    throw new Error("No workspace data found");
  }

  const creds = readTwilioWorkspaceCredentials(
    (data as { twilio_data?: unknown }).twilio_data,
  );
  if (!creds) {
    throw new Error("Workspace twilio_data not found");
  }

  const twilio = new Twilio.Twilio(creds.sid, creds.authToken, {
    accountSid: creds.sid,
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

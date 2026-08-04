import { eq } from "drizzle-orm";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { env } from "@/lib/env.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { createTenantDb } from "@/server/tenant-db";
import { INBOUND_RING_COUNT_DEFAULT } from "../../shared/inbound-rings";

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

const CALLER_ID_CAPABILITIES = {
  fax: false,
  mms: false,
  sms: false,
  voice: false,
  verification_status: "pending",
  emergency_address_status: "not_started",
  emergency_address_sid: null,
  emergency_eligible: false,
  emergency_compliance_status: "not_started",
} as const;

export async function startWorkspaceCallerIdVerification({
  workspaceId,
  phoneNumber,
  friendlyName,
}: {
  workspaceId: string;
  phoneNumber: string;
  friendlyName: string;
}): Promise<StartWorkspaceCallerIdVerificationResult> {
  const twilio = await createWorkspaceTwilioInstance({
    workspace_id: workspaceId,
  });

  const validationRequest = await twilio.validationRequests.create({
    friendlyName,
    phoneNumber,
    statusCallback: `${env.BASE_URL()}/api/caller-id/status`,
  });
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const tdb = createTenantDb(workspaceId);
  const now = new Date().toISOString();

  const existing = await tdb.workspace_number.findFirst({
    where: eq(workspaceNumberTable.phone_number, normalizedPhoneNumber),
  });

  const upsertValues = {
    friendly_name: friendlyName,
    phone_number: normalizedPhoneNumber,
    type: "caller_id",
    capabilities: CALLER_ID_CAPABILITIES,
  };

  const numberRequest = existing
    ? await tdb.workspace_number.update({
        set: upsertValues,
        where: eq(workspaceNumberTable.id, existing.id),
      })
    : await tdb.workspace_number.insert({
        ...upsertValues,
        created_at: now,
        handset_enabled: false,
        // DB check: inbound_ring_count BETWEEN 1 AND 10.
        inbound_ring_count: INBOUND_RING_COUNT_DEFAULT,
      });

  if (!numberRequest[0]) {
    throw new Error("Error inserting workspace number");
  }

  // Plain POJO for action/fetcher JSON — Twilio SDK instances are unreliable once
  // serialized. Prefer the submitted number when the API omits phone_number.
  const plainValidationRequest: CallerIdValidationRequest = {
    accountSid: String(validationRequest.accountSid ?? ""),
    callSid: String(validationRequest.callSid ?? ""),
    friendlyName: String(validationRequest.friendlyName ?? friendlyName),
    phoneNumber: String(
      validationRequest.phoneNumber || normalizedPhoneNumber || phoneNumber,
    ),
    validationCode: String(validationRequest.validationCode ?? ""),
  };

  return {
    validationRequest: plainValidationRequest,
    numberRequest: numberRequest as StartWorkspaceCallerIdVerificationResult["numberRequest"],
  };
}

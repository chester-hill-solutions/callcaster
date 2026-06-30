import { eq } from "drizzle-orm";
import { workspace_number as workspaceNumberTable } from "@/db/schema";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { normalizePhoneNumber } from "@/lib/utils";
import { createTenantDb } from "@/server/tenant-db";

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
  /** @deprecated Drizzle path — ignored. */
  supabaseClient?: unknown;
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
        inbound_ring_count: 0,
      });

  if (!numberRequest[0]) {
    throw new Error("Error inserting workspace number");
  }

  return {
    validationRequest: validationRequest as CallerIdValidationRequest,
    numberRequest: numberRequest as StartWorkspaceCallerIdVerificationResult["numberRequest"],
  };
}

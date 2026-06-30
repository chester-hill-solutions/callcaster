import {
  buildDefaultWorkspaceTwilioPortalSnapshot,
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalSnapshot,
} from "@/lib/database.server";
import { loadBillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import type { BillingReconciliationReport } from "@/lib/billing-reconciliation.server";
import {
  getWorkspaceBillingReconciliationSnapshot,
  type BillingReconciliationSnapshot,
} from "@/lib/billing-reconciliation-snapshot.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";

import type { Database } from "@/lib/db-types";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import type { WorkspaceTwilioPortalSnapshot } from "@/lib/types";

export interface TwilioPageData {
  twilioAccountInfo: {
    sid: string;
    friendlyName: string;
    status: string;
    type: string;
    dateCreated: string;
  } | null;
  twilioNumbers: Array<{
    sid: string;
    phoneNumber: string;
    friendlyName: string;
    capabilities: {
      voice: boolean;
      sms: boolean;
      mms: boolean;
      fax: boolean;
    };
    voiceReceiveMode?: string;
    smsApplicationSid?: string;
    voiceApplicationSid?: string;
    addressRequirements?: string;
    status?: string;
  }>;
  twilioUsage: Array<{
    category: string;
    description: string;
    usage: string;
    usageUnit: string;
    price: string;
    startDate?: string;
    endDate?: string;
  }>;
  portalSnapshot: WorkspaceTwilioPortalSnapshot;
  billingReconciliation: BillingReconciliationReport | null;
  billingReconciliationSnapshot: BillingReconciliationSnapshot | null;
}

export async function loadTwilioData(
  workspaceId: string,
): Promise<TwilioPageData> {



  let twilioAccountInfo: TwilioPageData["twilioAccountInfo"] = null;
  let twilioNumbers: TwilioPageData["twilioNumbers"] = [];
  let twilioUsage: TwilioPageData["twilioUsage"] = [];
  let billingReconciliation: BillingReconciliationReport | null = null;
  let billingReconciliationSnapshot: BillingReconciliationSnapshot | null = null;

  const portalSnapshot = await getWorkspaceTwilioPortalSnapshot({
    workspaceId,
  }).catch((error): WorkspaceTwilioPortalSnapshot => {
    logger.error("Error fetching Twilio portal snapshot:", error);
    return buildDefaultWorkspaceTwilioPortalSnapshot();
  });

  try {
    const workspace = await getWorkspaceById(workspaceId);

    const adminTwilioCreds = readTwilioWorkspaceCredentials(workspace?.twilio_data);
    billingReconciliationSnapshot = getWorkspaceBillingReconciliationSnapshot(
      workspace?.twilio_data,
    );
    if (adminTwilioCreds?.sid) {
      const twilio = await createWorkspaceTwilioInstance({         workspace_id: workspaceId,
      });
      const [account, numbers, usageRecords] = await Promise.all([
        twilio.api.v2010.accounts(adminTwilioCreds.sid).fetch(),
        twilio.incomingPhoneNumbers.list({ limit: 20 }),
        twilio.usage.records.list(),
      ]);

      twilioAccountInfo = {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type,
        dateCreated: account.dateCreated.toISOString(),
      };

      twilioNumbers = numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        capabilities: number.capabilities,
        voiceReceiveMode: number.voiceReceiveMode,
        smsApplicationSid: number.smsApplicationSid,
        voiceApplicationSid: number.voiceApplicationSid,
        addressRequirements: number.addressRequirements,
        status: number.status,
      }));

      twilioUsage = usageRecords.map((record) => ({
        category: record.category,
        description: record.description,
        usage: record.usage,
        usageUnit: record.usageUnit,
        price: record.price.toString(),
        startDate: record.startDate?.toISOString(),
        endDate: record.endDate?.toISOString(),
      }));

      billingReconciliation = await loadBillingReconciliationReport({
        workspaceId,
        twilioUsage,
      }).catch((reconcileError) => {
        logger.error("Error building billing reconciliation report:", reconcileError);
        return null;
      });
    }
  } catch (error) {
    logger.error("Error fetching Twilio information:", error);
  }

  return {
    twilioAccountInfo,
    twilioNumbers,
    twilioUsage,
    portalSnapshot,
    billingReconciliation,
    billingReconciliationSnapshot,
  };
}

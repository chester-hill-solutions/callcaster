import {
  createWorkspaceTwilioInstance,
  getWorkspaceTwilioPortalSnapshot,
} from "@/lib/database/workspace.server";
import { data as routeData, redirect } from "react-router";
import { getAdminWorkspaceDetail } from "@/lib/platform-admin.server";
import { logger } from "@/lib/logger.server";
import { adminRouteAuth } from "@/lib/admin-route.server";
import { defineLoader } from "@/lib/handler.server";
import { projectTwilioAccountForClient, type TwilioAccountClientData } from "@/lib/twilio-client-projection.server";

interface TwilioPhoneNumber {
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
}



interface TwilioUsageRecord {
  category: string;
  description: string;
  usage: string;
  usageUnit: string;
  price: string;
  startDate?: Date;
  endDate?: Date;
}

export const loader = defineLoader({
  auth: adminRouteAuth,
  sideEffects: ["db-read", "twilio"],
  handler: async ({ auth, params }) => {
  const { userData } = auth;
  const workspaceId = params.workspaceId;

  if (!workspaceId) {
    throw redirect("/admin?tab=workspaces");
  }

  const detail = await getAdminWorkspaceDetail(workspaceId);
  if (!detail.ok) {
    throw redirect("/admin?tab=workspaces");
  }

  const { workspace, workspaceUsers, phoneNumbers } = detail;

  let twilioAccountInfo: TwilioAccountClientData | null = null;
  let twilioNumbers: TwilioPhoneNumber[] = [];
  let twilioUsage: TwilioUsageRecord[] = [];

  try {
    const twilio = await createWorkspaceTwilioInstance({       workspace_id: workspaceId,
    });

    if (twilio.accountSid) {
      const account = await twilio.api.v2010.accounts(twilio.accountSid).fetch();
      const numbers = await twilio.incomingPhoneNumbers.list({ limit: 20 });
      const usageRecords = await twilio.usage.records.list();

      twilioAccountInfo = projectTwilioAccountForClient(account);
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
        startDate: record.startDate,
        endDate: record.endDate,
      }));
    }
  } catch (error) {
    logger.error("Error fetching Twilio information:", error);
  }

  const twilioPortalSnapshot = await getWorkspaceTwilioPortalSnapshot({
    workspaceId,
  }).catch((error) => {
    logger.error("Error fetching Twilio portal snapshot:", error);
    return null;
  });

  return routeData({
    user: userData,
    workspace,
    workspaceUsers,
    phoneNumbers,
    twilioAccountInfo,
    twilioNumbers,
    twilioUsage,
    twilioPortalSnapshot,
  });
  },
});

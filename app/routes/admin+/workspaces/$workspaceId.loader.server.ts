import { createWorkspaceTwilioInstance, getWorkspaceTwilioPortalSnapshot } from "@/lib/database.server";
import { data as routeData, redirect } from "react-router";
import { getAdminWorkspaceDetail } from "@/lib/platform-admin.server";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { requireSudoAdmin } from "../../requireSudoAdmin.server";
import type { LoaderFunctionArgs } from "react-router";

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

interface TwilioAccount {
  sid: string;
  friendlyName: string;
  status: string;
  type: string;
  dateCreated: Date;
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, userData } = await requireSudoAdmin(request);
  const workspaceId = params.workspaceId;

  if (!workspaceId) {
    throw redirect("/admin?tab=workspaces");
  }

  const detail = await getAdminWorkspaceDetail(supabaseClient, workspaceId);
  if (!detail.ok) {
    throw redirect("/admin?tab=workspaces");
  }

  const { workspace, workspaceUsers, phoneNumbers } = detail;

  let twilioAccountInfo: TwilioAccount | null = null;
  let twilioNumbers: TwilioPhoneNumber[] = [];
  let twilioUsage: TwilioUsageRecord[] = [];

  try {
    const twilio = await createWorkspaceTwilioInstance({
      supabase: supabaseClient,
      workspace_id: workspaceId,
    });

    const adminTwilioCreds = readTwilioWorkspaceCredentials(workspace.twilio_data);
    if (adminTwilioCreds?.sid) {
      const account = await twilio.api.v2010.accounts(adminTwilioCreds.sid).fetch();
      const numbers = await twilio.incomingPhoneNumbers.list({ limit: 20 });
      const usageRecords = await twilio.usage.records.list();

      twilioAccountInfo = account;
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
    supabaseClient,
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
};

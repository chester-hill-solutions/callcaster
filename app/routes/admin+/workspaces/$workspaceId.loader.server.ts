import { createWorkspaceTwilioInstance, getWorkspaceTwilioPortalSnapshot } from "@/lib/database.server";
import { data as routeData, redirect } from "react-router";
import { logger } from "@/lib/logger.server";
import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";
import { verifyAuth } from "@/lib/supabase.server";
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

    const { supabaseClient, user } = await verifyAuth(request);

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData?.access_level !== 'sudo') {
        throw redirect("/signin");
    }

    const workspaceId = params.workspaceId;
    
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    // Get workspace details
    const { data: workspace } = await supabaseClient
        .from("workspace")
        .select("*, campaign(*)")
        .eq("id", workspaceId)
        .single();

    if (!workspace) {
        throw redirect("/admin?tab=workspaces");
    }

    // Get workspace users
    const { data: workspaceUsers } = await supabaseClient
        .from("workspace_users")
        .select("*, user:user_id(*)")
        .eq("workspace_id", workspaceId);

    // Get workspace phone numbers
    const { data: phoneNumbers } = await supabaseClient
        .from("workspace_number")
        .select("*")
        .eq("workspace", workspaceId);

    // Get Twilio subaccount information
    let twilioAccountInfo: TwilioAccount | null = null;
    let twilioNumbers: TwilioPhoneNumber[] = [];
    let twilioUsage: TwilioUsageRecord[] = [];
    
    try {
        // Create Twilio instance for this workspace
        const twilio = await createWorkspaceTwilioInstance({ 
            supabase: supabaseClient, 
            workspace_id: workspaceId 
        });
        
        const adminTwilioCreds = readTwilioWorkspaceCredentials(workspace.twilio_data);
        if (adminTwilioCreds?.sid) {
            // Get account details
            const account = await twilio.api.v2010.accounts(adminTwilioCreds.sid).fetch();
            
            // Get phone numbers
            const numbers = await twilio.incomingPhoneNumbers.list({limit: 20});
            
            // Get usage records (last 30 days)
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 30);
            
            const usageRecords = await twilio.usage.records.list();
            
            twilioAccountInfo = account;
            twilioNumbers = numbers.map(number => ({
                sid: number.sid,
                phoneNumber: number.phoneNumber,
                friendlyName: number.friendlyName,
                capabilities: number.capabilities,
                voiceReceiveMode: number.voiceReceiveMode,
                smsApplicationSid: number.smsApplicationSid,
                voiceApplicationSid: number.voiceApplicationSid,
                addressRequirements: number.addressRequirements,
                status: number.status
            }));
            twilioUsage = usageRecords.map(record => ({
                category: record.category,
                description: record.description,
                usage: record.usage,
                usageUnit: record.usageUnit,
                price: record.price.toString(),
                startDate: record.startDate,
                endDate: record.endDate
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
        workspaceUsers: workspaceUsers || [],
        phoneNumbers: phoneNumbers || [],
        twilioAccountInfo,
        twilioNumbers,
        twilioUsage,
        twilioPortalSnapshot,
    });
}

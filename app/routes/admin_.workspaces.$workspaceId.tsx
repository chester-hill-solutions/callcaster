import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Outlet, useLocation } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { ArrowLeft, Phone, MessageSquare, RefreshCw, Image, FileText } from "lucide-react";
import WorkspaceOverview from "@/components/workspace/WorkspaceOverview";

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

    if (!user) {
        throw redirect("/signin");
    }

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
        .select("*")
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
        
        if (workspace.twilio_data?.sid) {
            // Get account details
            const account = await twilio.api.v2010.accounts(workspace.twilio_data.sid).fetch();
            
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

    return json({ 
        user: userData, 
        workspace, 
        workspaceUsers: workspaceUsers || [],
        phoneNumbers: phoneNumbers || [],
        twilioAccountInfo,
        twilioNumbers,
        twilioUsage
    });
};

export default function WorkspaceDetails() {
    const { workspace, workspaceUsers, phoneNumbers, twilioAccountInfo, twilioNumbers, twilioUsage } = useLoaderData<typeof loader>();
    const location = useLocation();
    
    // Determine active tab from URL
    const getActiveTab = () => {
        const path = location.pathname;
        if (path.endsWith('/twilio')) return 'twilio';
        if (path.endsWith('/users')) return 'users';
        if (path.endsWith('/campaigns')) return 'campaigns';
        return 'overview';
    };

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    };

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" size="sm" asChild>
                    <Link to="/admin?tab=workspaces">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Workspaces
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">{workspace.name}</h1>
                <Badge variant={workspace.disabled ? "destructive" : "secondary"}>
                    {workspace.disabled ? "Disabled" : "Active"}
                </Badge>
            </div>

            <Tabs value={getActiveTab()} className="w-full">
                <TabsList className="mb-6">
                    <TabsTrigger value="overview" asChild>
                        <Link to=".">Overview</Link>
                    </TabsTrigger>
                    <TabsTrigger value="twilio" asChild>
                        <Link to="twilio">Twilio Account</Link>
                    </TabsTrigger>
                    <TabsTrigger value="users" asChild>
                        <Link to="users">Users</Link>
                    </TabsTrigger>
                    <TabsTrigger value="campaigns" asChild>
                        <Link to="campaigns">Campaigns</Link>
                    </TabsTrigger>
                </TabsList>
                {getActiveTab() === "overview" ? (
                 <WorkspaceOverview 
                    workspace={workspace as any} 
                    workspaceUsers={workspaceUsers} 
                    phoneNumbers={phoneNumbers}    
                 />
                ) : (
                    <Outlet context={{ workspace, workspaceUsers, phoneNumbers }} />
                )}
            </Tabs>
        </div>
    );
}

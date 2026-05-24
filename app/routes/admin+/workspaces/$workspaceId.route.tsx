export { loader } from "./$workspaceId.loader.server";

import { data as routeData, LoaderFunctionArgs, redirect, useLoaderData, Link, Outlet, useLocation } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { readTwilioWorkspaceCredentials } from "@/lib/twilio-workspace-credentials";

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

export default function WorkspaceDetails() {
    const { workspace, workspaceUsers, phoneNumbers, twilioPortalSnapshot } = useLoaderData();
    const location = useLocation();
    
    // Determine active tab from URL
    const getActiveTab = () => {
        const path = location.pathname;
        if (path.endsWith('/twilio')) return 'twilio';
        if (path.endsWith('/users')) return 'users';
        if (path.endsWith('/invite')) return 'access';
        if (path.endsWith('/campaigns')) return 'campaigns';
        return 'overview';
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
                {twilioPortalSnapshot?.syncSnapshot && (
                    <Badge
                        variant={
                            twilioPortalSnapshot.syncSnapshot.lastSyncStatus === "error"
                                ? "destructive"
                                : twilioPortalSnapshot.syncSnapshot.lastSyncStatus === "healthy"
                                    ? "secondary"
                                    : "outline"
                        }
                    >
                        Twilio: {twilioPortalSnapshot.syncSnapshot.lastSyncStatus}
                    </Badge>
                )}
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
                    <TabsTrigger value="access" asChild>
                        <Link to="invite">Access</Link>
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
                    twilioSnapshot={twilioPortalSnapshot}
                 />
                ) : (
                    <Outlet context={{ workspace, workspaceUsers, phoneNumbers }} />
                )}
            </Tabs>
        </div>
    );
}

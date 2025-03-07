import { LoaderFunctionArgs, defer, redirect } from "@remix-run/node";
import { Await, useLoaderData, useOutletContext } from "@remix-run/react";
import { Suspense } from "react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { createWorkspaceTwilioInstance } from "~/lib/database.server";
import { Phone, MessageSquare, RefreshCw, Image, FileText, Loader2 } from "lucide-react";

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

interface TwilioData {
    twilioAccountInfo: {
        sid: string;
        friendlyName: string;
        status: string;
        type: string;
        dateCreated: string;
    } | null;
    twilioNumbers: {
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
    }[];
    twilioUsage: {
        category: string;
        description: string;
        usage: string;
        usageUnit: string;
        price: string;
        startDate?: string;
        endDate?: string;
    }[];
}

async function loadTwilioData(supabaseClient: any, workspaceId: string): Promise<TwilioData> {
    let twilioAccountInfo: TwilioData['twilioAccountInfo'] = null;
    let twilioNumbers: TwilioData['twilioNumbers'] = [];
    let twilioUsage: TwilioData['twilioUsage'] = [];
    
    try {
        // Get workspace details first
        const { data: workspace } = await supabaseClient
            .from("workspace")
            .select("*")
            .eq("id", workspaceId)
            .single();

        if (!workspace) {
            return { twilioAccountInfo, twilioNumbers, twilioUsage };
        }

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
            
            twilioAccountInfo = {
                sid: account.sid,
                friendlyName: account.friendlyName,
                status: account.status,
                type: account.type,
                dateCreated: account.dateCreated.toISOString()
            };

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
                startDate: record.startDate?.toISOString(),
                endDate: record.endDate?.toISOString()
            }));
        }
    } catch (error) {
        console.error("Error fetching Twilio information:", error);
    }

    return { twilioAccountInfo, twilioNumbers, twilioUsage };
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

    return defer({ 
        twilioData: loadTwilioData(supabaseClient, workspaceId)
    });
};

function LoadingCard({ title, description }: { title: string; description: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                </div>
            </CardContent>
        </Card>
    );
}

function groupAndFilterUsageData(usageData: TwilioData['twilioUsage']) {
    // Group related categories and sum their costs
    const groupedData = usageData.reduce((acc, record) => {
        // Skip entries with 0 usage and $0 cost
        if (record.usage === '0' && record.price === '0') {
            return acc;
        }

        // Define main categories
        const mainCategories: { [key: string]: string[] } = {
            'SMS': ['sms', 'sms-inbound', 'sms-outbound', 'bundle-sms'],
            'Voice': ['calls', 'calls-inbound', 'calls-outbound'],
            'Phone Numbers': ['phonenumbers', 'phonenumbers-local', 'phonenumbers-mobile'],
            'MMS': ['mms', 'mms-inbound', 'mms-outbound'],
            'Carrier Fees': ['sms-messages-carrierfees', 'mms-messages-carrierfees'],
            'Failed Messages': ['failed-message-processing-fee'],
            'Other': []
        };

        // Find the main category for this record
        let mainCategory = 'Other';
        for (const [category, prefixes] of Object.entries(mainCategories)) {
            if (prefixes.some(prefix => record.category.startsWith(prefix))) {
                mainCategory = category;
                break;
            }
        }

        // Create or update the category in our accumulator
        if (!acc[mainCategory]) {
            acc[mainCategory] = {
                usage: 0,
                price: 0,
                details: []
            };
        }

        // Add the record's usage and price
        acc[mainCategory].usage += parseFloat(record.usage) || 0;
        acc[mainCategory].price += parseFloat(record.price) || 0;
        
        // Only add detail if it has non-zero usage
        if (parseFloat(record.usage) > 0) {
            acc[mainCategory].details.push({
                description: record.description,
                usage: record.usage,
                usageUnit: record.usageUnit,
                price: record.price
            });
        }

        return acc;
    }, {} as Record<string, { usage: number; price: number; details: Array<{ description: string; usage: string; usageUnit: string; price: string; }> }>);

    return groupedData;
}

export default function WorkspaceTwilio() {
    const { twilioData } = useLoaderData<typeof loader>();

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount);
    };

    return (
        <div className="grid grid-cols-1 gap-6">
            <Suspense fallback={<LoadingCard title="Twilio Subaccount Information" description="Loading account details..." />}>
                <Await resolve={twilioData}>
                    {(data: TwilioData) => (
                        <>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Twilio Subaccount Information</CardTitle>
                                        <CardDescription>Details about the Twilio subaccount for this workspace</CardDescription>
                                    </div>
                                    <Button variant="outline" size="sm">
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Refresh
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    {data.twilioAccountInfo ? (
                                        <dl className="space-y-4">
                                            <div className="flex flex-col">
                                                <dt className="text-sm font-medium text-gray-500">Account SID</dt>
                                                <dd className="mt-1 text-sm font-mono">{data.twilioAccountInfo.sid}</dd>
                                            </div>
                                            <div className="flex flex-col">
                                                <dt className="text-sm font-medium text-gray-500">Friendly Name</dt>
                                                <dd className="mt-1 text-sm">{data.twilioAccountInfo.friendlyName}</dd>
                                            </div>
                                            <div className="flex flex-col">
                                                <dt className="text-sm font-medium text-gray-500">Status</dt>
                                                <dd className="mt-1 text-sm">
                                                    <Badge variant={data.twilioAccountInfo.status === "active" ? "secondary" : "outline"}>
                                                        {data.twilioAccountInfo.status}
                                                    </Badge>
                                                </dd>
                                            </div>
                                            <div className="flex flex-col">
                                                <dt className="text-sm font-medium text-gray-500">Type</dt>
                                                <dd className="mt-1 text-sm">{data.twilioAccountInfo.type}</dd>
                                            </div>
                                            <div className="flex flex-col">
                                                <dt className="text-sm font-medium text-gray-500">Created</dt>
                                                <dd className="mt-1 text-sm">{new Date(data.twilioAccountInfo.dateCreated).toLocaleString()}</dd>
                                            </div>
                                        </dl>
                                    ) : (
                                        <div className="py-4 text-center text-gray-500">
                                            Unable to fetch Twilio account information
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            
                            <Card>
                                <CardHeader>
                                    <CardTitle>Phone Numbers</CardTitle>
                                    <CardDescription>Phone numbers associated with this Twilio subaccount</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {data.twilioNumbers && data.twilioNumbers.length > 0 ? (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Phone Number</TableHead>
                                                    <TableHead>Friendly Name</TableHead>
                                                    <TableHead>Capabilities</TableHead>
                                                    <TableHead>Media</TableHead>
                                                    <TableHead>Region</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.twilioNumbers.map((number) => (
                                                    <TableRow key={number.sid}>
                                                        <TableCell className="font-medium">{number.phoneNumber}</TableCell>
                                                        <TableCell>{number.friendlyName}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {number.capabilities.voice && (
                                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                                        <Phone className="h-3 w-3" />
                                                                        Voice
                                                                    </Badge>
                                                                )}
                                                                {number.capabilities.sms && (
                                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                                        <MessageSquare className="h-3 w-3" />
                                                                        SMS
                                                                    </Badge>
                                                                )}
                                                                {number.capabilities.mms && (
                                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                                        <Image className="h-3 w-3" />
                                                                        MMS
                                                                    </Badge>
                                                                )}
                                                                {number.capabilities.fax && (
                                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                                        <FileText className="h-3 w-3" />
                                                                        Fax
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                {number.voiceReceiveMode && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        Voice: {number.voiceReceiveMode}
                                                                    </Badge>
                                                                )}
                                                                {number.smsApplicationSid && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        SMS App Configured
                                                                    </Badge>
                                                                )}
                                                                {number.voiceApplicationSid && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        Voice App Configured
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <div className="text-sm">{number.addressRequirements || 'No address requirements'}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={number.status === "in-use" ? "secondary" : "outline"}>
                                                                {number.status || 'Active'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="py-4 text-center text-gray-500">
                                            No phone numbers found for this account
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            
                            <Card>
                                <CardHeader>
                                    <CardTitle>Usage</CardTitle>
                                    <CardDescription>Usage statistics for the last 30 days</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {data.twilioUsage && data.twilioUsage.length > 0 ? (
                                        <>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-[200px]">Category</TableHead>
                                                        <TableHead>Details</TableHead>
                                                        <TableHead className="text-right">Cost</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.entries(groupAndFilterUsageData(data.twilioUsage))
                                                        .sort((a, b) => b[1].price - a[1].price) // Sort by price descending
                                                        .map(([category, data]) => (
                                                            <TableRow key={category}>
                                                                <TableCell className="font-medium">{category}</TableCell>
                                                                <TableCell>
                                                                    <div className="space-y-1">
                                                                        {data.details.map((detail, idx) => (
                                                                            <div key={idx} className="text-sm">
                                                                                <span className="text-muted-foreground">{detail.description}: </span>
                                                                                <span className="font-medium">{detail.usage} {detail.usageUnit}</span>
                                                                                {parseFloat(detail.price) > 0 && (
                                                                                    <span className="text-muted-foreground ml-2">
                                                                                        (${parseFloat(detail.price).toFixed(2)})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span className="font-medium">${data.price.toFixed(2)}</span>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    <TableRow className="font-bold">
                                                        <TableCell>Total</TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell className="text-right">
                                                            ${Object.values(groupAndFilterUsageData(data.twilioUsage))
                                                                .reduce((sum, data) => sum + data.price, 0)
                                                                .toFixed(2)}
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                            <p className="text-sm text-muted-foreground mt-4">
                                                * Usage data for the last 30 days
                                            </p>
                                        </>
                                    ) : (
                                        <div className="py-4 text-center text-gray-500">
                                            No usage data available
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </Await>
            </Suspense>
        </div>
    );
} 
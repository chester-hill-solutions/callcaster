import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Database } from "~/lib/database.types";

const ITEMS_PER_PAGE = 10;

type Call = Database["public"]["Tables"]["call"]["Row"];
type Message = Database["public"]["Tables"]["message"]["Row"];
type CallStatus = NonNullable<Call["status"]>;

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

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const tab = searchParams.get("tab") || "voice";
    const page = parseInt(searchParams.get("page") || "1");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    // Base query for calls
    let callQuery = supabaseClient
        .from("call")
        .select("*", { count: "exact" })
        .eq("workspace", workspaceId)
        .order("date_created", { ascending: false });

    // Base query for messages
    let messageQuery = supabaseClient
        .from("message")
        .select("*", { count: "exact" })
        .eq("workspace", workspaceId)
        .order("date_created", { ascending: false });

    // Apply filters
    if (search) {
        callQuery = callQuery.or(`from.ilike.%${search}%,to.ilike.%${search}%`);
        messageQuery = messageQuery.or(`from.ilike.%${search}%,to.ilike.%${search}%,body.ilike.%${search}%`);
    }

    if (status) {
        callQuery = callQuery.eq("status", status as CallStatus);
    }

    if (startDate) {
        callQuery = callQuery.gte("date_created", startDate);
        messageQuery = messageQuery.gte("date_created", startDate);
    }

    if (endDate) {
        callQuery = callQuery.lte("date_created", endDate);
        messageQuery = messageQuery.lte("date_created", endDate);
    }

    // Apply pagination
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let calls = { data: [] as Call[], count: 0 };
    let messages = { data: [] as Message[], count: 0 };

    if (tab === "voice") {
        const result = await callQuery.range(from, to);
        calls = {
            data: result.data || [],
            count: result.count || 0
        };
    } else {
        const result = await messageQuery.range(from, to);
        messages = {
            data: result.data || [],
            count: result.count || 0
        };
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

    return json({ 
        workspace,
        calls: calls.data,
        messages: messages.data,
        totalCount: tab === "voice" ? calls.count : messages.count,
        currentPage: page,
        totalPages: Math.ceil((tab === "voice" ? calls.count : messages.count) / ITEMS_PER_PAGE),
        filters: {
            search,
            status,
            startDate,
            endDate
        }
    });
};

export default function WorkspaceCampaigns() {
    const { workspace, calls, messages, totalCount, currentPage, totalPages, filters } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get("tab") || "voice";

    const updateFilter = (key: string, value: string) => {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }
        newParams.set("page", "1"); // Reset to first page when filters change
        setSearchParams(newParams);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Communications</CardTitle>
                <CardDescription>Calls and messages in this workspace</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4 space-y-4">
                    <div className="flex gap-4">
                        <Input
                            placeholder="Search by phone number or message..."
                            value={filters.search}
                            onChange={(e) => updateFilter("search", e.target.value)}
                            className="max-w-sm"
                        />
                        {tab === "voice" && (
                            <Select
                                value={filters.status}
                                onValueChange={(value) => updateFilter("status", value)}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">All Statuses</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                    <SelectItem value="busy">Busy</SelectItem>
                                    <SelectItem value="no-answer">No Answer</SelectItem>
                                    <SelectItem value="canceled">Canceled</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        <Input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => updateFilter("startDate", e.target.value)}
                            className="w-[180px]"
                        />
                        <Input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => updateFilter("endDate", e.target.value)}
                            className="w-[180px]"
                        />
                    </div>
                </div>

                <Tabs value={tab} onValueChange={(value) => updateFilter("tab", value)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="voice">Calls</TabsTrigger>
                        <TabsTrigger value="message">Messages</TabsTrigger>
                    </TabsList>
                    <TabsContent value="voice">
                        {calls.length > 0 ? (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calls.map((call) => (
                                            <TableRow key={call.sid}>
                                                <TableCell className="font-medium">{call.from}</TableCell>
                                                <TableCell>{call.to}</TableCell>
                                                <TableCell>
                                                    <Badge 
                                                        variant={
                                                            call.status === 'completed' ? 'secondary' : 
                                                            call.status === 'failed' ? 'destructive' : 
                                                            call.status === 'busy' ? 'outline' : 
                                                            call.status === 'no-answer' ? 'outline' : 
                                                            'secondary'
                                                        }
                                                    >
                                                        {call.status || 'Unknown'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{call.duration ? `${Math.round(parseInt(call.duration) / 60)}m ${parseInt(call.duration) % 60}s` : 'N/A'}</TableCell>
                                                <TableCell>{new Date(call.date_created).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="text-sm text-gray-500">
                                        Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} calls
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateFilter("page", (currentPage - 1).toString())}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateFilter("page", (currentPage + 1).toString())}
                                            disabled={currentPage === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="py-4 text-center text-gray-500">
                                No calls found for this workspace
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="message">
                        {messages.length > 0 ? (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Message</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {messages.map((message) => (
                                            <TableRow key={message.sid}>
                                                <TableCell className="font-medium">{message.from}</TableCell>
                                                <TableCell>{message.to}</TableCell>
                                                <TableCell>
                                                    {message.body ? 
                                                        `${message.body.substring(0, 50)}${message.body.length > 50 ? '...' : ''}` : 
                                                        'No message text'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge 
                                                        variant={
                                                            message.status === 'delivered' ? 'secondary' : 
                                                            message.status === 'failed' ? 'destructive' : 
                                                            message.status === 'sent' ? 'secondary' : 
                                                            'outline'
                                                        }
                                                    >
                                                        {message.status || 'Unknown'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{new Date(message.date_created || '').toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="text-sm text-gray-500">
                                        Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} messages
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateFilter("page", (currentPage - 1).toString())}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateFilter("page", (currentPage + 1).toString())}
                                            disabled={currentPage === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="py-4 text-center text-gray-500">
                                No messages found for this workspace
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
} 
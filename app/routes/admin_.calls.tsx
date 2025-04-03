import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import type { Tables } from "~/lib/database.types";

type Call = Tables<"call">;
type Workspace = Tables<"workspace">;
type Message = Tables<"message">;   

interface TransformedCall extends Call {
    workspace_name: string;
}

interface TransformedMessage extends Message {
    workspace_name: string;
}

interface ActivityData {
    calls: TransformedCall[];
    messages: TransformedMessage[];
    workspaces: Workspace[];
} 

export const loader = async ({ request }: LoaderFunctionArgs) => {
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

    // Get all workspaces
    const { data: workspaces } = await supabaseClient
        .from("workspace")
        .select("id, name");

    if (!workspaces) {
        return json({ calls: [], workspaces: [] });
    }

    // Get all calls with workspace information
    const { data: calls, error } = await supabaseClient
        .from("call")
        .select(`
            *,
            workspace:workspace(name)
        `)
        .order('date_created', { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching calls:", error);
        return json({ calls: [], workspaces: [], messages: [] });
    }
    const { data: messages, error: messagesError } = await supabaseClient
        .from("message")
        .select(`
            *,
            workspace:workspace(name)
        `)
        .order('date_created', { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching messages:", error);
        return json({ calls: [], workspaces: [], messages: [] });
    }

    // Transform the data to match our UI needs
    const transformedCalls: TransformedCall[] = calls.map(call => ({
        ...call,
        workspace_name: String(call.workspace?.name || 'Unknown')
    }));

    const transformedMessages: TransformedMessage[] = messages.map(message => ({
        ...message,
        workspace_name: String(message.workspace?.name || 'Unknown')
    }));

    return json({ 
        calls: transformedCalls,
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        messages: transformedMessages
    });
};

export default function AdminCalls() {
    const { calls, workspaces, messages } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [filters, setFilters] = useState({
        search: "",
        status: "all",
        workspace: "all",
        dateRange: "all"
    });

    // Apply filters to calls
    const filteredCalls = calls.filter(call => {
        // Search in various fields
        let matchesSearch = true;
        if (filters.search !== "") {
            const searchLower = filters.search.toLowerCase();
            matchesSearch = false;
            
            if (call.to?.toLowerCase().includes(searchLower)) matchesSearch = true;
            if (call.from?.toLowerCase().includes(searchLower)) matchesSearch = true;
            if (call.sid?.toLowerCase().includes(searchLower)) matchesSearch = true;
            if (call.workspace_name?.toLowerCase().includes(searchLower)) matchesSearch = true;
        }

        // Status filter
        const matchesStatus = filters.status === "all" || call.status === filters.status;
        
        // Workspace filter
        const matchesWorkspace = filters.workspace === "all" || call.workspace === filters.workspace;
        
        // Date range filter
        let matchesDateRange = true;
        if (filters.dateRange !== "all") {
            const callDate = new Date(call.date_created);
            const now = new Date();
            const daysAgo = parseInt(filters.dateRange);
            const cutoffDate = new Date(now.setDate(now.getDate() - daysAgo));
            matchesDateRange = callDate >= cutoffDate;
        }

        return matchesSearch && matchesStatus && matchesWorkspace && matchesDateRange;
    });

    // Calculate pagination
    const totalPages = Math.ceil(filteredCalls.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedCalls = filteredCalls.slice(startIndex, startIndex + itemsPerPage);

    // Get unique statuses for filter
    const statuses = Array.from(new Set(calls.map(c => c.status))).filter(Boolean);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    return (
        <div className="container mx-auto py-8 px-4">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Call History</CardTitle>
                            <CardDescription>
                                View and monitor calls across all workspaces
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                {filteredCalls.length} calls
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search calls..."
                                    className="pl-8"
                                    value={filters.search}
                                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="w-[150px]">
                            <Select 
                                value={filters.status} 
                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {statuses.map(status => (
                                        <SelectItem key={status} value={status}>{status}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[150px]">
                            <Select 
                                value={filters.workspace} 
                                onValueChange={(value) => setFilters(prev => ({ ...prev, workspace: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Workspace" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Workspaces</SelectItem>
                                    {workspaces.map(workspace => (
                                        <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[150px]">
                            <Select 
                                value={filters.dateRange} 
                                onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Date Range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="1">Last 24 Hours</SelectItem>
                                    <SelectItem value="7">Last 7 Days</SelectItem>
                                    <SelectItem value="30">Last 30 Days</SelectItem>
                                    <SelectItem value="90">Last 90 Days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button 
                            variant="outline" 
                            onClick={() => setFilters({ search: "", status: "all", workspace: "all", dateRange: "all" })}
                        >
                            Clear Filters
                        </Button>
                    </div>

                    {/* Calls Table */}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Workspace</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Price</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedCalls.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No calls found matching your filters
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCalls.map((call) => (
                                    <TableRow key={call.sid}>
                                        <TableCell className="text-xs">
                                            {new Date(call.date_created).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{call.from}</TableCell>
                                        <TableCell className="font-mono text-xs">{call.to}</TableCell>
                                        <TableCell>{call.workspace_name}</TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant={
                                                    call.status === 'completed' ? 'secondary' : 
                                                    call.status === 'failed' ? 'destructive' : 
                                                    call.status === 'busy' ? 'outline' : 
                                                    call.status === 'no-answer' ? 'outline' : 
                                                    call.status === 'canceled' ? 'outline' : 
                                                    'outline'
                                                }
                                            >
                                                {call.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{call.duration ? `${Math.floor(Number(call.duration) / 60)}:${(Number(call.duration) % 60).toString().padStart(2, '0')}` : '-'}</TableCell>
                                        <TableCell>{call.price ? `$${parseFloat(call.price).toFixed(4)}` : '-'}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {filteredCalls.length > 0 && (
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                                <Select 
                                    value={String(itemsPerPage)} 
                                    onValueChange={(value) => setItemsPerPage(Number(value))}
                                >
                                    <SelectTrigger className="w-[100px]">
                                        <SelectValue placeholder="Per page" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="5">5 per page</SelectItem>
                                        <SelectItem value="10">10 per page</SelectItem>
                                        <SelectItem value="20">20 per page</SelectItem>
                                        <SelectItem value="50">50 per page</SelectItem>
                                    </SelectContent>
                                </Select>
                                <span className="text-sm text-muted-foreground">
                                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCalls.length)} of {filteredCalls.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        
                                        return (
                                            <Button 
                                                key={pageNum}
                                                variant={currentPage === pageNum ? "default" : "outline"} 
                                                size="sm"
                                                onClick={() => setCurrentPage(pageNum)}
                                                className="w-8 h-8 p-0"
                                            >
                                                {pageNum}
                                            </Button>
                                        );
                                    })}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
} 
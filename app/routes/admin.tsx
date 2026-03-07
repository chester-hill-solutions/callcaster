import { ActionFunctionArgs, LoaderFunctionArgs, redirect, json } from "@remix-run/node";
import { useLoaderData, Link, Outlet, NavLink, useSearchParams, useActionData, Form } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminAsyncExportButton } from "@/components/campaign/home/CampaignHomeScreen/AdminAsyncExportButton";
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    deriveWorkspaceAdminRows,
    filterWorkspaceAdminRows,
    sortWorkspaceAdminRows,
    type WorkspaceSortKey,
} from "@/lib/admin-workspaces";
import { syncWorkspaceTwilioSnapshot } from "@/lib/database.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { supabaseClient, user } = await verifyAuth(request)

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

    const { data: workspaces } = await supabaseClient
        .from("workspace")
        .select("*, campaign(*)")

    if (!workspaces) {
        throw redirect("/signin");
    }

    // Get all users
    const { data: users } = await supabaseClient
        .from("user")
        .select("*")
        .order("created_at", { ascending: false });

    // Get workspace users relationship
    const { data: workspaceUsers } = await supabaseClient
        .from("workspace_users")
        .select("*");

    const { data: workspaceNumbers } = await supabaseClient
        .from("workspace_number")
        .select("*");

    // Get all campaigns (not just recent ones)
    const { data: allCampaigns } = await supabaseClient
        .from("campaign")
        .select("*, workspace(*)")
        .order("created_at", { ascending: false });

    return json({ 
        user: userData, 
        workspaces, 
        users, 
        workspaceUsers,
        workspaceNumbers,
        campaigns: allCampaigns || [],
        stats: {
            totalWorkspaces: workspaces?.length || 0,
            totalUsers: users?.length || 0,
            totalCampaigns: workspaces?.reduce((acc, workspace) => acc + (workspace.campaign?.length || 0), 0) || 0,
            activeWorkspaces: workspaces?.filter(w => !w.disabled).length || 0
        }
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
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

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "toggle_workspace_status") {
        const workspaceId = formData.get("workspaceId") as string;
        const currentStatus = formData.get("currentStatus") === "true";
        
        const { error } = await supabaseClient
            .from("workspace")
            .update({ disabled: !currentStatus })
            .eq("id", workspaceId);

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: `Workspace ${currentStatus ? 'enabled' : 'disabled'} successfully` });
    }

    if (action === "sync_workspace_twilio") {
        const workspaceId = formData.get("workspaceId") as string;
        try {
            await syncWorkspaceTwilioSnapshot({
                supabaseClient,
                workspaceId,
            });
            return json({ success: "Workspace Twilio sync completed" });
        } catch (error) {
            return json({
                error: error instanceof Error ? error.message : "Failed to sync workspace Twilio data",
            });
        }
    }

    if (action === "sync_all_workspaces_twilio") {
        const { error } = await supabaseClient.functions.invoke("workspace-twilio-sync", {
            body: {},
        });

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "Workspace Twilio sync started for all workspaces" });
    }
    
    if (action === "toggle_user_status") {
        const userId = formData.get("userId") as string;
        
        // For now, we'll just disable users by setting access_level to 'disabled'
        // This assumes the system will check for this value elsewhere
        const { error } = await supabaseClient
            .from("user")
            .update({ access_level: 'disabled' })
            .eq("id", userId);

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: `User disabled successfully` });
    }

    return json({ error: "Invalid action" });
};

export default function Admin() {
    const { user, workspaces, users, workspaceUsers, workspaceNumbers, campaigns, stats } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const actionData = useActionData<typeof action>();
    const currentTab = searchParams.get("tab") || "workspaces";

    // Pagination state for workspaces
    const [workspaceCurrentPage, setWorkspaceCurrentPage] = useState(1);
    const [workspaceItemsPerPage, setWorkspaceItemsPerPage] = useState(10);
    const [workspaceFilter, setWorkspaceFilter] = useState<{
        search: string;
        status: "all" | "active" | "disabled";
        owner: string;
        opsState: "all" | "ready" | "attention" | "pending";
        sortKey: WorkspaceSortKey;
        sortDirection: "asc" | "desc";
    }>({
        search: "",
        status: "all",
        owner: "all",
        opsState: "all",
        sortKey: "created_at",
        sortDirection: "desc",
    });
    
    // Pagination state for campaigns
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    // Pagination state for users
    const [userCurrentPage, setUserCurrentPage] = useState(1);
    const [userItemsPerPage, setUserItemsPerPage] = useState(10);
    
    // Filtering state for campaigns
    const [campaignFilter, setCampaignFilter] = useState({
        search: "",
        status: "all",
        type: "all",
        workspace: "all"
    });
    
    // Filtering state for users
    const [userFilter, setUserFilter] = useState({
        search: "",
        accessLevel: "all"
    });
    
    // Apply filters to campaigns
    const filteredCampaigns = campaigns.filter(campaign => {
        // Search in title, id, or workspace name
        let matchesSearch = true;
        
        if (campaignFilter.search !== "") {
            const searchLower = campaignFilter.search.toLowerCase();
            matchesSearch = false; // Default to false when search is active
            
            // Check title
            const title = typeof campaign.title === 'string' ? campaign.title : '';
            if (title.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
            
            // Check ID
            const id = typeof campaign.id === 'string' ? campaign.id : String(campaign.id || '');
            if (id.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
            
            // Check workspace name
            const workspaceName = campaign.workspace && typeof campaign.workspace.name === 'string' 
                ? campaign.workspace.name 
                : '';
            if (workspaceName.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
        }
            
        const matchesStatus = campaignFilter.status === "all" || 
            campaign.status === campaignFilter.status;
            
        const matchesType = campaignFilter.type === "all" || 
            campaign.type === campaignFilter.type;
            
        const matchesWorkspace = campaignFilter.workspace === "all" || 
            (campaign.workspace && campaign.workspace.id === campaignFilter.workspace);
            
        return matchesSearch && matchesStatus && matchesType && matchesWorkspace;
    });
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedCampaigns = filteredCampaigns.slice(startIndex, startIndex + itemsPerPage);
    
    // Get unique campaign types and statuses for filters
    const campaignTypes = Array.from(new Set(campaigns.map(c => c.type).filter(Boolean)));
    const campaignStatuses = Array.from(new Set(campaigns.map(c => c.status).filter(Boolean)));
    
    // Apply filters to users
    const filteredUsers = users?.filter(user => {
        // Search in username, name, or ID
        let matchesSearch = true;
        
        if (userFilter.search !== "") {
            const searchLower = userFilter.search.toLowerCase();
            matchesSearch = false; // Default to false when search is active
            
            // Check username
            const username = typeof user.username === 'string' ? user.username : '';
            if (username.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
            
            // Check name
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
            if (fullName.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
            
            // Check ID
            const id = typeof user.id === 'string' ? user.id : String(user.id || '');
            if (id.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
        }
            
        const matchesAccessLevel = userFilter.accessLevel === "all" || 
            user.access_level === userFilter.accessLevel;
            
        return matchesSearch && matchesAccessLevel;
    }) || [];
    
    // Calculate pagination for users
    const userTotalPages = Math.ceil(filteredUsers.length / userItemsPerPage);
    const userStartIndex = (userCurrentPage - 1) * userItemsPerPage;
    const paginatedUsers = filteredUsers.slice(userStartIndex, userStartIndex + userItemsPerPage);
    
    // Get unique access levels for filters
    const accessLevels = Array.from(new Set(users?.map(u => u.access_level).filter(Boolean))) || [];

    const workspaceRows = useMemo(() => deriveWorkspaceAdminRows({
        workspaces: workspaces || [],
        users: users || [],
        workspaceUsers: workspaceUsers || [],
        workspaceNumbers: workspaceNumbers || [],
    }), [users, workspaceNumbers, workspaceUsers, workspaces]);

    const filteredWorkspaceRows = useMemo(() => filterWorkspaceAdminRows(workspaceRows, {
        search: workspaceFilter.search,
        status: workspaceFilter.status,
        owner: workspaceFilter.owner,
        opsState: workspaceFilter.opsState,
    }), [workspaceFilter.owner, workspaceFilter.opsState, workspaceFilter.search, workspaceFilter.status, workspaceRows]);

    const sortedWorkspaceRows = useMemo(
        () => sortWorkspaceAdminRows(filteredWorkspaceRows, workspaceFilter.sortKey, workspaceFilter.sortDirection),
        [filteredWorkspaceRows, workspaceFilter.sortDirection, workspaceFilter.sortKey],
    );

    const workspaceTotalPages = Math.ceil(sortedWorkspaceRows.length / workspaceItemsPerPage);
    const workspaceStartIndex = (workspaceCurrentPage - 1) * workspaceItemsPerPage;
    const paginatedWorkspaceRows = sortedWorkspaceRows.slice(
        workspaceStartIndex,
        workspaceStartIndex + workspaceItemsPerPage,
    );

    const workspaceOwners = useMemo(
        () =>
            workspaceRows
                .filter((row) => row.ownerUserId !== null)
                .map((row) => ({ id: row.ownerUserId as string, username: row.ownerUsername }))
                .filter((owner, index, owners) => owners.findIndex((item) => item.id === owner.id) === index)
                .sort((left, right) => left.username.localeCompare(right.username)),
        [workspaceRows],
    );
    
    // Update the URL when tab changes
    const handleTabChange = (value: string) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.set("tab", value);
            return newParams;
        });
    };
    
    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [campaignFilter]);

    useEffect(() => {
        setUserCurrentPage(1);
    }, [userFilter]);

    useEffect(() => {
        setWorkspaceCurrentPage(1);
    }, [workspaceFilter]);

    // Show toast notifications for action results
    useEffect(() => {
        if (actionData && 'success' in actionData) {
            toast.success(actionData.success);
        }
        
        if (actionData && 'error' in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);
    
    // Replace the Campaigns Tab content with the following:
    const renderCampaignsTab = () => (
        <TabsContent value="campaigns">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Campaign Management</CardTitle>
                            <CardDescription>
                                Monitor and manage campaigns across all workspaces
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                {filteredCampaigns.length} campaigns
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
                                    placeholder="Search campaigns..."
                                    className="pl-8"
                                    value={campaignFilter.search}
                                    onChange={(e) => setCampaignFilter(prev => ({ ...prev, search: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="w-[150px]">
                            <Select 
                                value={campaignFilter.status} 
                                onValueChange={(value) => setCampaignFilter(prev => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {campaignStatuses.map(status => (
                                        <SelectItem key={status} value={status || 'Unknown'}>{status || 'Unknown'}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[150px]">
                            <Select 
                                value={campaignFilter.type} 
                                onValueChange={(value) => setCampaignFilter(prev => ({ ...prev, type: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    {campaignTypes.map(type => (
                                        <SelectItem key={type} value={type || 'Unknown'}>{type || 'Unknown'}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[200px]">
                            <Select 
                                value={campaignFilter.workspace} 
                                onValueChange={(value) => setCampaignFilter(prev => ({ ...prev, workspace: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Workspace" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Workspaces</SelectItem>
                                    {workspaces?.map(workspace => (
                                        <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button 
                            variant="outline" 
                            onClick={() => setCampaignFilter({ search: "", status: "all", type: "all", workspace: "all" })}
                        >
                            Clear Filters
                        </Button>
                    </div>
                    
                    {/* Campaigns Table */}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead>Workspace</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedCampaigns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        No campaigns found matching your filters
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCampaigns.map((campaign) => (
                                    <TableRow key={campaign.id}>
                                        <TableCell className="font-medium">{campaign.title}</TableCell>
                                        <TableCell className="font-mono text-xs">{campaign.id}</TableCell>
                                        <TableCell>{campaign.workspace?.name || 'Unknown'}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {campaign.type || 'Unknown'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant={
                                                    campaign.status === 'running' ? 'secondary' : 
                                                    campaign.status === 'paused' ? 'outline' : 
                                                    campaign.status === 'draft' ? 'outline' : 
                                                    'secondary'
                                                }
                                            >
                                                {campaign.status || 'Unknown'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {campaign.is_active ? (
                                                <Badge variant="secondary">Active</Badge>
                                            ) : (
                                                <Badge variant="outline">Inactive</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(campaign.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" size="sm" asChild>
                                                    <NavLink to={`/workspaces/${campaign.workspace?.id}/campaigns/${campaign.id}`}>
                                                        View
                                                    </NavLink>
                                                </Button>
                                                <AdminAsyncExportButton 
                                                    campaignId={campaign.id} 
                                                    workspaceId={campaign.workspace?.id} 
                                                />
                                                <Button variant="outline" size="sm" className="text-red-500">
                                                    {campaign.is_active ? 'Deactivate' : 'Activate'}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    
                    {/* Pagination */}
                    {filteredCampaigns.length > 0 && (
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
                                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCampaigns.length)} of {filteredCampaigns.length}
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
                                        // Show pages around current page
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
        </TabsContent>
    );

    return (
        <div className="container mx-auto py-8 px-4">
            <Toaster position="top-right" />
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                    <p className="text-gray-500">Welcome back, {user.first_name || user.username}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-3 py-1">
                        Access Level: {user.access_level}
                    </Badge>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalWorkspaces}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {stats.activeWorkspaces} active
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalUsers}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Across all workspaces
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalCampaigns}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Across all workspaces
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center">
                            <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                            <div className="text-sm font-medium">Operational</div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            All systems running normally
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="mb-6">
                    <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="settings">System Settings</TabsTrigger>
                </TabsList>
                
                {/* Workspaces Tab */}
                <TabsContent value="workspaces">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Workspaces</CardTitle>
                                    <CardDescription>
                                        Scan workspace health, filter by ownership and ops state, and jump directly into admin flows.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Form method="post">
                                        <input type="hidden" name="_action" value="sync_all_workspaces_twilio" />
                                        <Button variant="outline" size="sm" type="submit">
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Sync Twilio
                                        </Button>
                                    </Form>
                                    <Button size="sm">Add Workspace</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4 flex flex-wrap gap-3">
                                <div className="min-w-[240px] flex-1">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search name, ID, or owner..."
                                            className="pl-8"
                                            value={workspaceFilter.search}
                                            onChange={(e) => setWorkspaceFilter((prev) => ({ ...prev, search: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="w-[160px]">
                                    <Select
                                        value={workspaceFilter.status}
                                        onValueChange={(value: "all" | "active" | "disabled") =>
                                            setWorkspaceFilter((prev) => ({ ...prev, status: value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All statuses</SelectItem>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="disabled">Disabled</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-[180px]">
                                    <Select
                                        value={workspaceFilter.owner}
                                        onValueChange={(value) => setWorkspaceFilter((prev) => ({ ...prev, owner: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Owner" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All owners</SelectItem>
                                            {workspaceOwners.map((owner) => (
                                                <SelectItem key={owner.id} value={owner.id}>
                                                    {owner.username}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-[180px]">
                                    <Select
                                        value={workspaceFilter.opsState}
                                        onValueChange={(value: "all" | "ready" | "attention" | "pending") =>
                                            setWorkspaceFilter((prev) => ({ ...prev, opsState: value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Ops state" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All ops states</SelectItem>
                                            <SelectItem value="ready">Ready</SelectItem>
                                            <SelectItem value="attention">Attention</SelectItem>
                                            <SelectItem value="pending">Pending</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-[180px]">
                                    <Select
                                        value={workspaceFilter.sortKey}
                                        onValueChange={(value: WorkspaceSortKey) =>
                                            setWorkspaceFilter((prev) => ({ ...prev, sortKey: value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sort by" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="created_at">Created</SelectItem>
                                            <SelectItem value="name">Name</SelectItem>
                                            <SelectItem value="credits">Credits</SelectItem>
                                            <SelectItem value="campaign_count">Campaigns</SelectItem>
                                            <SelectItem value="member_count">Members</SelectItem>
                                            <SelectItem value="phone_number_count">Phone numbers</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="w-[140px]">
                                    <Select
                                        value={workspaceFilter.sortDirection}
                                        onValueChange={(value: "asc" | "desc") =>
                                            setWorkspaceFilter((prev) => ({ ...prev, sortDirection: value }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Direction" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="desc">Descending</SelectItem>
                                            <SelectItem value="asc">Ascending</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        setWorkspaceFilter({
                                            search: "",
                                            status: "all",
                                            owner: "all",
                                            opsState: "all",
                                            sortKey: "created_at",
                                            sortDirection: "desc",
                                        })
                                    }
                                >
                                    Clear Filters
                                </Button>
                            </div>

                            <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
                                <span>{sortedWorkspaceRows.length} workspaces</span>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Credits</TableHead>
                                        <TableHead>Members</TableHead>
                                        <TableHead>Numbers</TableHead>
                                        <TableHead>Campaigns</TableHead>
                                        <TableHead>Twilio / Ops</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedWorkspaceRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                                                No workspaces found matching your filters
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedWorkspaceRows.map((workspace) => (
                                            <TableRow key={workspace.id}>
                                                <TableCell>
                                                    <div className="font-medium">{workspace.name}</div>
                                                    <div className="font-mono text-xs text-muted-foreground">{workspace.id}</div>
                                                </TableCell>
                                                <TableCell>{workspace.ownerUsername}</TableCell>
                                                <TableCell>
                                                    {workspace.disabled ? (
                                                        <Badge variant="destructive">Disabled</Badge>
                                                    ) : (
                                                        <Badge variant="secondary">Active</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>{workspace.credits}</TableCell>
                                                <TableCell>{workspace.memberCount}</TableCell>
                                                <TableCell>{workspace.phoneNumberCount}</TableCell>
                                                <TableCell>{workspace.campaignCount}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex flex-wrap gap-1">
                                                            <Badge
                                                                variant={
                                                                    workspace.opsState === "attention"
                                                                        ? "destructive"
                                                                        : workspace.opsState === "pending"
                                                                            ? "outline"
                                                                            : "secondary"
                                                                }
                                                            >
                                                                {workspace.opsState}
                                                            </Badge>
                                                            <Badge variant="outline">{workspace.twilioSyncStatus}</Badge>
                                                            <Badge variant="outline">{workspace.sendMode === "messaging_service" ? "Messaging Service" : "From number"}</Badge>
                                                            <Badge variant="outline">{workspace.onboardingStatus}</Badge>
                                                            <Badge variant={workspace.voiceReady ? "secondary" : "outline"}>
                                                                {workspace.voiceReady ? "Voice ready" : "Voice review"}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {workspace.twilioLastSyncedAt
                                                                ? `Synced ${new Date(workspace.twilioLastSyncedAt).toLocaleString()}`
                                                                : "Never synced"}
                                                        </div>
                                                        {workspace.twilioLastSyncError && (
                                                            <div className="text-xs text-destructive">{workspace.twilioLastSyncError}</div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {new Date(workspace.createdAt).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="outline" size="sm" asChild>
                                                            <NavLink to={`/admin/workspaces/${workspace.id}`}>Open</NavLink>
                                                        </Button>
                                                        <Button variant="outline" size="sm" asChild>
                                                            <NavLink to={`/admin/workspaces/${workspace.id}/twilio`}>Twilio</NavLink>
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="outline" size="icon" className="h-8 w-8">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Workspace actions</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem asChild>
                                                                    <NavLink to={`/admin/workspaces/${workspace.id}/users`}>Users</NavLink>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild>
                                                                    <NavLink to={`/admin/workspaces/${workspace.id}/invite`}>Access</NavLink>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <Form method="post">
                                                                    <input type="hidden" name="_action" value="sync_workspace_twilio" />
                                                                    <input type="hidden" name="workspaceId" value={workspace.id} />
                                                                    <DropdownMenuItem asChild>
                                                                        <button type="submit" className="w-full text-left">
                                                                            Sync Twilio now
                                                                        </button>
                                                                    </DropdownMenuItem>
                                                                </Form>
                                                                <Form method="post">
                                                                    <input type="hidden" name="_action" value="toggle_workspace_status" />
                                                                    <input type="hidden" name="workspaceId" value={workspace.id} />
                                                                    <input type="hidden" name="currentStatus" value={workspace.disabled.toString()} />
                                                                    <DropdownMenuItem asChild>
                                                                        <button type="submit" className="w-full text-left">
                                                                            {workspace.disabled ? "Enable workspace" : "Disable workspace"}
                                                                        </button>
                                                                    </DropdownMenuItem>
                                                                </Form>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>

                            {sortedWorkspaceRows.length > 0 && (
                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Select
                                            value={String(workspaceItemsPerPage)}
                                            onValueChange={(value) => setWorkspaceItemsPerPage(Number(value))}
                                        >
                                            <SelectTrigger className="w-[120px]">
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
                                            Showing {workspaceStartIndex + 1}-{Math.min(workspaceStartIndex + workspaceItemsPerPage, sortedWorkspaceRows.length)} of {sortedWorkspaceRows.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceCurrentPage((prev) => Math.max(prev - 1, 1))}
                                            disabled={workspaceCurrentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(workspaceTotalPages, 5) }, (_, index) => {
                                                let pageNum;
                                                if (workspaceTotalPages <= 5) {
                                                    pageNum = index + 1;
                                                } else if (workspaceCurrentPage <= 3) {
                                                    pageNum = index + 1;
                                                } else if (workspaceCurrentPage >= workspaceTotalPages - 2) {
                                                    pageNum = workspaceTotalPages - 4 + index;
                                                } else {
                                                    pageNum = workspaceCurrentPage - 2 + index;
                                                }

                                                return (
                                                    <Button
                                                        key={pageNum}
                                                        variant={workspaceCurrentPage === pageNum ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setWorkspaceCurrentPage(pageNum)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        {pageNum}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceCurrentPage((prev) => Math.min(prev + 1, workspaceTotalPages))}
                                            disabled={workspaceCurrentPage === workspaceTotalPages}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Users Tab */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>User Management</CardTitle>
                                    <CardDescription>
                                        Monitor and manage users across all workspaces
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm">Add User</Button>
                                    <span className="text-sm text-muted-foreground">
                                        {filteredUsers.length} users
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
                                            placeholder="Search users..."
                                            className="pl-8"
                                            value={userFilter.search}
                                            onChange={(e) => setUserFilter(prev => ({ ...prev, search: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="w-[150px]">
                                    <Select 
                                        value={userFilter.accessLevel} 
                                        onValueChange={(value) => setUserFilter(prev => ({ ...prev, accessLevel: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Access Level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Levels</SelectItem>
                                            {accessLevels.map(level => (
                                                <SelectItem key={level} value={level || 'standard'}>{level || 'standard'}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setUserFilter({ search: "", accessLevel: "all" })}
                                >
                                    Clear Filters
                                </Button>
                            </div>
                            
                            {/* Users Table */}
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Access Level</TableHead>
                                        <TableHead>Workspaces</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedUsers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                No users found matching your filters
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedUsers.map((userData) => {
                                            const userWorkspaces = workspaceUsers?.filter(wu => wu.user_id === userData.id) || [];
                                            const userWorkspaceDetails = userWorkspaces.map(uw => {
                                                const workspace = workspaces?.find(w => w.id === uw.workspace_id);
                                                return {
                                                    ...uw,
                                                    workspaceName: workspace?.name || 'Unknown',
                                                    workspaceId: workspace?.id
                                                };
                                            });
                                            
                                            return (
                                                <TableRow key={userData.id}>
                                                    <TableCell className="font-medium">{userData.username}</TableCell>
                                                    <TableCell>
                                                        {userData.first_name} {userData.last_name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={userData.access_level === 'sudo' ? 'default' : 'outline'}>
                                                            {userData.access_level || 'standard'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-1">
                                                            {userWorkspaceDetails.length > 0 ? (
                                                                userWorkspaceDetails.slice(0, 2).map(uwd => (
                                                                    <Badge key={uwd.workspace_id} variant="outline" className="flex items-center gap-1">
                                                                        {uwd.workspaceName}
                                                                        <span className="text-xs opacity-70">({uwd.role})</span>
                                                                    </Badge>
                                                                ))
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">No workspaces</span>
                                                            )}
                                                            {userWorkspaceDetails.length > 2 && (
                                                                <Badge variant="outline">+{userWorkspaceDetails.length - 2} more</Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {new Date(userData.created_at).toLocaleDateString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Button variant="outline" size="sm" asChild>
                                                                <Link to={`/admin/users/${userData.id}/edit`}>Edit User</Link>
                                                            </Button>
                                                            <Button variant="outline" size="sm" asChild>
                                                                <Link to={`/admin/users/${userData.id}/workspaces`}>Manage Workspaces</Link>
                                                            </Button>
                                                            <Form method="post">
                                                                <input type="hidden" name="_action" value="toggle_user_status" />
                                                                <input type="hidden" name="userId" value={userData.id} />
                                                                <input type="hidden" name="currentStatus" value="false" />
                                                                <Button variant="outline" size="sm" type="submit" className="text-red-500">
                                                                    Disable
                                                                </Button>
                                                            </Form>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                            
                            {/* Pagination */}
                            {filteredUsers.length > 0 && (
                                <div className="flex items-center justify-between mt-4">
                                    <div className="flex items-center gap-2">
                                        <Select 
                                            value={String(userItemsPerPage)} 
                                            onValueChange={(value) => setUserItemsPerPage(Number(value))}
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
                                            Showing {userStartIndex + 1}-{Math.min(userStartIndex + userItemsPerPage, filteredUsers.length)} of {filteredUsers.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => setUserCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={userCurrentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(userTotalPages, 5) }, (_, i) => {
                                                // Show pages around current page
                                                let pageNum;
                                                if (userTotalPages <= 5) {
                                                    pageNum = i + 1;
                                                } else if (userCurrentPage <= 3) {
                                                    pageNum = i + 1;
                                                } else if (userCurrentPage >= userTotalPages - 2) {
                                                    pageNum = userTotalPages - 4 + i;
                                                } else {
                                                    pageNum = userCurrentPage - 2 + i;
                                                }
                                                
                                                return (
                                                    <Button 
                                                        key={pageNum}
                                                        variant={userCurrentPage === pageNum ? "default" : "outline"} 
                                                        size="sm"
                                                        onClick={() => setUserCurrentPage(pageNum)}
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
                                            onClick={() => setUserCurrentPage(prev => Math.min(prev + 1, userTotalPages))}
                                            disabled={userCurrentPage === userTotalPages}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Campaigns Tab - Using the function we defined above */}
                {renderCampaignsTab()}
                
                {/* Settings Tab */}
                <TabsContent value="settings">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>System Settings</CardTitle>
                                <CardDescription>
                                    Configure global system settings
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium">Default Credits for New Workspaces</h3>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            defaultValue="100"
                                        />
                                        <Button>Save</Button>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium">System Maintenance Mode</h3>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline">Enable Maintenance Mode</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card>
                            <CardHeader>
                                <CardTitle>Audit Log</CardTitle>
                                <CardDescription>
                                    Recent system activity
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div key={i} className="flex items-start gap-4 text-sm">
                                            <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5"></div>
                                            <div>
                                                <p className="font-medium">System update completed</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(Date.now() - i * 3600000).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
            
            <Outlet />
        </div>
    );
} 
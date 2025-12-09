import { ActionFunctionArgs, LoaderFunctionArgs, redirect, json } from "@remix-run/node";
import { useLoaderData, Link, Outlet, NavLink, useSearchParams, useActionData, Form } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";

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

    // Get recent campaigns
    const { data: recentCampaigns } = await supabaseClient
        .from("campaign")
        .select("*, workspace(*)")
        .order("created_at", { ascending: false })
        .limit(10);

    return json({ 
        user: userData, 
        workspaces, 
        users, 
        workspaceUsers,
        recentCampaigns,
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

    return json({ error: "Invalid action" });
};

export default function Admin() {
    const { user, workspaces, users, workspaceUsers, recentCampaigns, stats } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const actionData = useActionData<typeof action>();
    const currentTab = searchParams.get("tab") || "workspaces";
    
    // Update the URL when tab changes
    const handleTabChange = (value: string) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.set("tab", value);
            return newParams;
        });
    };

    // Show toast notifications for action results
    useEffect(() => {
        if (actionData && 'success' in actionData) {
            toast.success(actionData.success);
        }
        
        if (actionData && 'error' in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);
    
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
                                <CardTitle>Workspaces</CardTitle>
                                <Button size="sm">Add Workspace</Button>
                            </div>
                            <CardDescription>
                                Manage all workspaces in the system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead>Credits</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Campaigns</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {workspaces?.map((workspace) => (
                                        <TableRow key={workspace.id}>
                                            <TableCell className="font-medium">{workspace.name}</TableCell>
                                            <TableCell className="font-mono text-xs">{workspace.id}</TableCell>
                                            <TableCell>
                                                {users?.find(u => u.id === workspaceUsers?.find(wu => wu.role === 'owner' && wu.workspace_id === workspace.id)?.user_id)?.username || 'No owner'}
                                            </TableCell>
                                            <TableCell>{workspace.credits}</TableCell>
                                            <TableCell>
                                                {workspace.disabled ? (
                                                    <Badge variant="destructive">Disabled</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Active</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>{workspace.campaign?.length || 0}</TableCell>
                                            <TableCell className="text-xs">
                                                {new Date(workspace.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="sm" asChild><NavLink to={`/workspaces/${workspace.id}/settings`}>Edit</NavLink></Button>
                                                    <Button variant="outline" size="sm" asChild><NavLink to={`/admin/workspaces/${workspace.id}/users`}>Users</NavLink></Button>
                                                    <Form method="post">
                                                        <input type="hidden" name="_action" value="toggle_workspace_status" />
                                                        <input type="hidden" name="workspaceId" value={workspace.id} />
                                                        <input type="hidden" name="currentStatus" value={workspace.disabled.toString()} />
                                                        <Button variant="outline" size="sm" type="submit" className="text-red-500">
                                                            {workspace.disabled ? 'Enable' : 'Disable'}
                                                        </Button>
                                                    </Form>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Users Tab */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Users</CardTitle>
                                <Button size="sm">Add User</Button>
                            </div>
                            <CardDescription>
                                Manage all users in the system
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Access Level</TableHead>
                                        <TableHead>Workspaces</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users?.map((user) => {
                                        const userWorkspaces = workspaceUsers?.filter(wu => wu.user_id === user.id) || [];
                                        return (
                                            <TableRow key={user.id}>
                                                <TableCell className="font-medium">{user.username}</TableCell>
                                                <TableCell>
                                                    {user.first_name} {user.last_name}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{user.id}</TableCell>
                                                <TableCell>
                                                    <Badge variant={user.access_level === 'sudo' ? 'default' : 'outline'}>
                                                        {user.access_level || 'standard'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{userWorkspaces.length}</TableCell>
                                                <TableCell className="text-xs">
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="outline" size="sm">Edit</Button>
                                                        <Button variant="outline" size="sm">Workspaces</Button>
                                                        <Button variant="outline" size="sm" className="text-red-500">
                                                            Disable
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                {/* Campaigns Tab */}
                <TabsContent value="campaigns">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Campaigns</CardTitle>
                            <CardDescription>
                                Monitor recent campaign activity across all workspaces
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
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
                                    {recentCampaigns?.map((campaign) => (
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
                                                    <Button variant="outline" size="sm" asChild><NavLink to={`/workspaces/${campaign.workspace?.id}/campaigns/${campaign.id}`}>View</NavLink></Button>
                                                    <Button variant="outline" size="sm" className="text-red-500">
                                                        {campaign.is_active ? 'Deactivate' : 'Activate'}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
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
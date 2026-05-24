export { loader } from "./route.loader.server";
export { action } from "./route.action.server";

import { Outlet, useActionData, useLoaderData, useSearchParams } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { AdminActionData, AdminLoaderData } from "./admin.types";
import { AdminCampaignsPanel } from "./panels/AdminCampaignsPanel";
import { AdminSystemSettingsPanel } from "./panels/AdminSystemSettingsPanel";
import { AdminUsersPanel } from "./panels/AdminUsersPanel";
import { AdminWorkspacesPanel } from "./panels/AdminWorkspacesPanel";

export default function Admin() {
    const { user, workspaces, users, workspaceUsers, workspaceRows, campaigns, stats } =
        useLoaderData<AdminLoaderData>();
    const [searchParams, setSearchParams] = useSearchParams();
    const actionData = useActionData<AdminActionData>();
    const currentTab = searchParams.get("tab") || "workspaces";

    const handleTabChange = (value: string) => {
        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.set("tab", value);
            return newParams;
        });
    };

    useEffect(() => {
        if (actionData && "success" in actionData) {
            toast.success(actionData.success);
        }

        if (actionData && "error" in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);

    return (
        <div className="container mx-auto py-8 px-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalWorkspaces}</div>
                        <p className="text-xs text-muted-foreground mt-1">{stats.activeWorkspaces} active</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalUsers}</div>
                        <p className="text-xs text-muted-foreground mt-1">Across all workspaces</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stats.totalCampaigns}</div>
                        <p className="text-xs text-muted-foreground mt-1">Across all workspaces</p>
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
                        <p className="text-xs text-muted-foreground mt-1">All systems running normally</p>
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

                <AdminWorkspacesPanel workspaceRows={workspaceRows} />
                <AdminUsersPanel users={users} workspaceUsers={workspaceUsers} workspaces={workspaces} />
                <AdminCampaignsPanel campaigns={campaigns} workspaces={workspaces} />
                <AdminSystemSettingsPanel />
            </Tabs>

            <Outlet />
        </div>
    );
}

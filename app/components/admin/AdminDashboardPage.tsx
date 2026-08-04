import { useActionData, useLoaderData, useSearchParams } from "react-router";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/typography";

import type { AdminActionData, AdminLoaderData } from "@/routes/admin+/admin.types";
import { AdminCampaignsPanel } from "@/routes/admin+/panels/AdminCampaignsPanel";
import { AdminSystemSettingsPanel } from "@/routes/admin+/panels/AdminSystemSettingsPanel";
import { AdminUsersPanel } from "@/routes/admin+/panels/AdminUsersPanel";
import { AdminWorkspacesPanel } from "@/routes/admin+/panels/AdminWorkspacesPanel";

export function AdminDashboardPage() {
    const { user, workspaces, users, workspaceUsers, workspaceRows, campaigns, deadLetteredJobs, stats } =
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

    useActionFeedback(actionData, {
        getSuccess: (data) => Boolean(data && "success" in data && data.success),
        successMessage: (data) =>
            data && "success" in data && typeof data.success === "string"
                ? data.success
                : "Saved",
        getError: (data) => (data && "error" in data ? data.error : undefined),
    });

    const headerClass = "mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between";
    const statValueClass = "text-3xl font-bold";
    const statusRowClass = "flex items-center";
    const statusDotClass = "mr-2 h-3 w-3 rounded-full bg-success";
    const statusLabelClass = "text-sm font-medium";

    return (
        <>
            <div className={headerClass}>
                <div>
                    <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                    <Text variant="muted">Welcome back, {user.first_name || user.username}</Text>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-3 py-1">
                        Access Level: {user.access_level}
                    </Badge>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={statValueClass}>{stats.totalWorkspaces}</div>
                        <Text variant="muted" className="mt-1 text-xs">
                            {stats.activeWorkspaces} active
                        </Text>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={statValueClass}>{stats.totalUsers}</div>
                        <Text variant="muted" className="mt-1 text-xs">
                            Across all workspaces
                        </Text>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={statValueClass}>{stats.totalCampaigns}</div>
                        <Text variant="muted" className="mt-1 text-xs">
                            Across all workspaces
                        </Text>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={statusRowClass}>
                            <span className={statusDotClass} aria-hidden />
                            <div className={statusLabelClass}>Operational</div>
                        </div>
                        <Text variant="muted" className="mt-1 text-xs">
                            All systems running normally
                        </Text>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="mb-6 h-auto w-full flex-wrap justify-start gap-1">
                    <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="settings">System Settings</TabsTrigger>
                </TabsList>

                <AdminWorkspacesPanel workspaceRows={workspaceRows} />
                <AdminUsersPanel users={users} workspaceUsers={workspaceUsers} workspaces={workspaces} />
                <AdminCampaignsPanel campaigns={campaigns} workspaces={workspaces} />
                <AdminSystemSettingsPanel deadLetteredJobs={deadLetteredJobs} />
            </Tabs>
        </>
    );
}

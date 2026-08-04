import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/lib/db-types";

type WorkspaceRecord = (Tables<"workspace"> & { campaign?: unknown[] }) | null;
type WorkspaceUserRecord = (Tables<"workspace_users"> & { user?: Tables<"user"> | null })[] | null | undefined;
type WorkspaceNumberRecord = Tables<"workspace_number">[] | null | undefined;
type WorkspaceTwilioSyncSnapshot = {
  lastSyncStatus?: string;
  accountStatus?: string;
  lastSyncedAt?: string;
  numberTypes?: string[];
  lastSyncError?: string;
};
type WorkspaceTwilioSnapshot = {
  syncSnapshot?: WorkspaceTwilioSyncSnapshot;
} | null | undefined;

export default function WorkspaceOverview({
    workspace,
    workspaceUsers,
    phoneNumbers,
    twilioSnapshot,
}: {
    workspace: WorkspaceRecord;
    workspaceUsers: WorkspaceUserRecord;
    phoneNumbers: WorkspaceNumberRecord;
    twilioSnapshot?: WorkspaceTwilioSnapshot;
}) {
    if (!workspace) {
        return null;
    }

    const users = workspaceUsers ?? [];
    const numbers = phoneNumbers ?? [];
    const campaigns = Array.isArray(workspace.campaign) ? workspace.campaign : [];
    const syncSnapshot = twilioSnapshot?.syncSnapshot;

    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle>Workspace Details</CardTitle>
                    <CardDescription>Basic information about this workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="space-y-4">
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">ID</dt>
                            <dd className="mt-1 text-sm font-mono">{workspace?.id}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Name</dt>
                            <dd className="mt-1 text-sm">{workspace?.name}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Credits</dt>
                            <dd className="mt-1 text-sm">{workspace?.credits}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                            <dd className="mt-1 text-sm">{workspace?.created_at ? new Date(workspace.created_at).toLocaleString() : ''}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                            <dd className="mt-1 text-sm">
                                <Badge variant={workspace?.disabled ? "destructive" : "secondary"}>
                                    {workspace?.disabled ? "Disabled" : "Active"}
                                </Badge>
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Statistics</CardTitle>
                    <CardDescription>Usage statistics for this workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="space-y-4">
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Total Campaigns</dt>
                            <dd className="mt-1 text-sm">{campaigns.length}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Total Users</dt>
                            <dd className="mt-1 text-sm">{users.length}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Phone Numbers</dt>
                            <dd className="mt-1 text-sm">{numbers.length}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Twilio Sync</CardTitle>
                    <CardDescription>Latest synced Twilio health for this workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="space-y-4">
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Sync Status</dt>
                            <dd className="mt-1 text-sm">
                                <Badge
                                    variant={
                                        syncSnapshot?.lastSyncStatus === "error"
                                            ? "destructive"
                                            : syncSnapshot?.lastSyncStatus === "healthy"
                                                ? "secondary"
                                                : "outline"
                                    }
                                >
                                    {syncSnapshot?.lastSyncStatus || "never_synced"}
                                </Badge>
                            </dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Account Status</dt>
                            <dd className="mt-1 text-sm">{syncSnapshot?.accountStatus || "Unknown"}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Last Synced</dt>
                            <dd className="mt-1 text-sm">
                                {syncSnapshot?.lastSyncedAt ? new Date(syncSnapshot.lastSyncedAt).toLocaleString() : "Never"}
                            </dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-muted-foreground">Number Types</dt>
                            <dd className="mt-1 text-sm">
                                {syncSnapshot?.numberTypes?.length ? syncSnapshot.numberTypes.join(", ") : "None detected"}
                            </dd>
                        </div>
                        {syncSnapshot?.lastSyncError && (
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Last Error</dt>
                                <dd className="mt-1 text-sm text-destructive">{syncSnapshot.lastSyncError}</dd>
                            </div>
                        )}
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
} 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";


export default function WorkspaceOverview({ workspace, workspaceUsers, phoneNumbers }: { workspace: any, workspaceUsers: any, phoneNumbers: any }) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Workspace Details</CardTitle>
                    <CardDescription>Basic information about this workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="space-y-4">
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">ID</dt>
                            <dd className="mt-1 text-sm font-mono">{workspace.id}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Name</dt>
                            <dd className="mt-1 text-sm">{workspace.name}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Credits</dt>
                            <dd className="mt-1 text-sm">{workspace.credits}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Created</dt>
                            <dd className="mt-1 text-sm">{new Date(workspace.created_at).toLocaleString()}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Status</dt>
                            <dd className="mt-1 text-sm">
                                <Badge variant={workspace.disabled ? "destructive" : "secondary"}>
                                    {workspace.disabled ? "Disabled" : "Active"}
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
                            <dt className="text-sm font-medium text-gray-500">Total Campaigns</dt>
                            <dd className="mt-1 text-sm">{workspace.campaign?.length || 0}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Total Users</dt>
                            <dd className="mt-1 text-sm">{workspaceUsers.length}</dd>
                        </div>
                        <div className="flex flex-col">
                            <dt className="text-sm font-medium text-gray-500">Phone Numbers</dt>
                            <dd className="mt-1 text-sm">{phoneNumbers.length}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
} 
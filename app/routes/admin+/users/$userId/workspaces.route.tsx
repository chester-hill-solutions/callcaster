export { loader } from "./workspaces.loader.server";
export { action } from "./workspaces.action.server";

import { data as routeData, ActionFunctionArgs, LoaderFunctionArgs, redirect, useLoaderData, useActionData, Form, Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import { toast } from "sonner";

;

;

export default function UserWorkspaces() {
    const { currentUser, targetUser, allWorkspaces, userWorkspaces, pendingInvites } = useLoaderData();
    const actionData = useActionData();

    // Filter out workspaces the user is already a member of
    const availableWorkspaces = allWorkspaces.filter(
        (workspace) => !userWorkspaces.some((uw) => uw.workspace_id === workspace.id)
    );

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
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Manage User Workspaces</h1>
                    <p className="text-gray-500">
                        Manage workspaces for {targetUser.first_name} {targetUser.last_name} ({targetUser.username})
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link to="/admin?tab=users">Back to Users</Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Add to Workspace */}
                <Card>
                    <CardHeader>
                        <CardTitle>Add to Workspace</CardTitle>
                        <CardDescription>
                            Add user to an existing workspace
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {availableWorkspaces.length === 0 ? (
                            <p className="text-muted-foreground">User is already a member of all workspaces.</p>
                        ) : (
                            <Form method="post" className="flex items-end gap-4">
                                <input type="hidden" name="_action" value="add_to_workspace" />
                                
                                <div className="space-y-2 flex-1">
                                    <p className="text-sm font-medium">Workspace</p>
                                    <Select name="workspaceId" required>
                                        <SelectTrigger aria-label="Workspace">
                                            <SelectValue placeholder="Select workspace" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableWorkspaces.map((workspace) => (
                                                <SelectItem key={workspace.id} value={workspace.id}>
                                                    {workspace.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2 w-[150px]">
                                    <p className="text-sm font-medium">Role</p>
                                    <Select name="role" defaultValue="member">
                                        <SelectTrigger aria-label="Role">
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="owner">Owner</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="member">Member</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <Button type="submit">Add to Workspace</Button>
                            </Form>
                        )}
                    </CardContent>
                </Card>

                {/* Current Workspaces */}
                <Card>
                    <CardHeader>
                        <CardTitle>Current Workspaces</CardTitle>
                        <CardDescription>
                            Workspaces the user is currently a member of
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {userWorkspaces.length === 0 ? (
                            <p className="text-muted-foreground">User is not a member of any workspaces.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Workspace</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {userWorkspaces.map((userWorkspace) => (
                                        <TableRow key={`${userWorkspace.workspace_id}-${userWorkspace.user_id}`}>
                                            <TableCell className="font-medium">
                                                {userWorkspace.workspace?.name || 'Unknown Workspace'}
                                            </TableCell>
                                            <TableCell>
                                                <Form method="post" className="flex items-center gap-2">
                                                    <input type="hidden" name="_action" value="update_role" />
                                                    <input type="hidden" name="workspaceId" value={userWorkspace.workspace_id} />
                                                    <Select name="role" defaultValue={userWorkspace.role}>
                                                        <SelectTrigger className="w-[120px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="owner">Owner</SelectItem>
                                                            <SelectItem value="admin">Admin</SelectItem>
                                                            <SelectItem value="member">Member</SelectItem>
                                                            <SelectItem value="viewer">Viewer</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button type="submit" size="sm" variant="outline">Update</Button>
                                                </Form>
                                            </TableCell>
                                            <TableCell>
                                                {userWorkspace.workspace?.disabled ? (
                                                    <Badge variant="destructive">Disabled</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Active</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Form method="post">
                                                    <input type="hidden" name="_action" value="remove_from_workspace" />
                                                    <input type="hidden" name="workspaceId" value={userWorkspace.workspace_id} />
                                                    <Button type="submit" variant="outline" size="sm" className="text-red-500">
                                                        Remove
                                                    </Button>
                                                </Form>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Pending Invitations */}
                {pendingInvites.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Invitations</CardTitle>
                            <CardDescription>
                                Workspace invitations that have not been accepted yet
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Workspace</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Invited On</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingInvites.map((invite) => (
                                        <TableRow key={invite.id}>
                                            <TableCell className="font-medium">
                                                {invite.workspace?.name || 'Unknown Workspace'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{invite.role}</Badge>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {new Date(invite.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <Form method="post">
                                                    <input type="hidden" name="_action" value="cancel_invite" />
                                                    <input type="hidden" name="inviteId" value={invite.id} />
                                                    <Button type="submit" variant="outline" size="sm" className="text-red-500">
                                                        Cancel Invite
                                                    </Button>
                                                </Form>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

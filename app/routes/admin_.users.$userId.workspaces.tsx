import { ActionFunctionArgs, LoaderFunctionArgs, redirect, json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import type { Tables } from "~/lib/database.types";

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

    const userId = params.userId;
    
    if (!userId) {
        throw redirect("/admin?tab=users");
    }

    // Get the user
    const { data: targetUser } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", userId)
        .single();

    if (!targetUser) {
        throw redirect("/admin?tab=users");
    }

    // Get all workspaces
    const { data: allWorkspaces } = await supabaseClient
        .from("workspace")
        .select("*")
        .order("name");

    // Get user's workspaces
    const { data: userWorkspaces } = await supabaseClient
        .from("workspace_users")
        .select("*, workspace(*)")
        .eq("user_id", userId);

    // Get pending invites
    const { data: pendingInvites } = await supabaseClient
        .from("workspace_invite")
        .select("*, workspace(*)")
        .eq("email", targetUser.username)
        .eq("status", "pending");

    return json({ 
        currentUser: userData,
        targetUser,
        allWorkspaces: allWorkspaces || [],
        userWorkspaces: userWorkspaces || [],
        pendingInvites: pendingInvites || []
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
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

    const userId = params.userId;
    
    if (!userId) {
        return json({ error: "User ID is required" });
    }

    const formData = await request.formData();
    const action = formData.get("_action") as string;

    if (action === "add_to_workspace") {
        const workspaceId = formData.get("workspaceId") as string;
        const role = formData.get("role") as string;

        if (!workspaceId) {
            return json({ error: "Workspace is required" });
        }

        if (!role) {
            return json({ error: "Role is required" });
        }

        // Check if user is already in the workspace
        const { data: existingMembership } = await supabaseClient
            .from("workspace_users")
            .select("*")
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId)
            .single();

        if (existingMembership) {
            return json({ error: "User is already a member of this workspace" });
        }

        // Add user to workspace
        const { error } = await supabaseClient
            .from("workspace_users")
            .insert({
                user_id: userId,
                workspace_id: workspaceId,
                role: role as "owner" | "member" | "caller" | "admin" | undefined
            });

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "User added to workspace successfully" });
    }

    if (action === "update_role") {
        const workspaceId = formData.get("workspaceId") as string;
        const role = formData.get("role") as "owner" | "member" | "caller" | "admin" | undefined;

        if (!workspaceId || !role) {
            return json({ error: "Workspace and role are required" });
        }

        const { error } = await supabaseClient
            .from("workspace_users")
            .update({ role: role as "owner" | "member" | "caller" | "admin" | undefined })
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId);

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "User role updated successfully" });
    }

    if (action === "remove_from_workspace") {
        const workspaceId = formData.get("workspaceId") as string;

        if (!workspaceId) {
            return json({ error: "Workspace ID is required" });
        }

        const { error } = await supabaseClient
            .from("workspace_users")
            .delete()
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId);

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "User removed from workspace successfully" });
    }

    if (action === "cancel_invite") {
        const inviteId = formData.get("inviteId") as string;

        if (!inviteId) {
            return json({ error: "Invite ID is required" });
        }

        const { error } = await supabaseClient
            .from("workspace_invite")
            .delete()
            .eq("id", inviteId);

        if (error) {
            return json({ error: error.message });
        }

        return json({ success: "Invitation cancelled successfully" });
    }

    return json({ error: "Invalid action" });
};

export default function UserWorkspaces() {
    const { currentUser, targetUser, allWorkspaces, userWorkspaces, pendingInvites } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();

    // Filter out workspaces the user is already a member of
    const availableWorkspaces = allWorkspaces.filter(
        (workspace: Tables<"workspace">) => !userWorkspaces.some((uw: { workspace_id: string }) => uw.workspace_id === workspace.id)
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
            <Toaster position="top-right" />
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
                                    <label className="text-sm font-medium">Workspace</label>
                                    <Select name="workspaceId" required>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select workspace" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableWorkspaces.map((workspace: Tables<"workspace">) => (
                                                <SelectItem key={workspace.id} value={workspace.id}>
                                                    {workspace.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                
                                <div className="space-y-2 w-[150px]">
                                    <label className="text-sm font-medium">Role</label>
                                    <Select name="role" defaultValue="member">
                                        <SelectTrigger>
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
                                    {userWorkspaces.map((userWorkspace: { workspace_id: string; user_id: string; role: string; workspace?: Tables<"workspace"> | null }) => (
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
                                    {pendingInvites.map((invite: { id: string; workspace?: Tables<"workspace"> | null; role: string; created_at: string }) => (
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
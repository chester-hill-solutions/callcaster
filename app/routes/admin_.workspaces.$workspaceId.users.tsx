import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

    // Get workspace users
    const { data: workspaceUsers } = await supabaseClient
        .from("workspace_users")
        .select("*, user:user_id(*)")
        .eq("workspace_id", workspaceId);

    return json({ 
        workspaceUsers: workspaceUsers || []
    });
};

export default function WorkspaceUsers() {
    const { workspaceUsers } = useLoaderData<typeof loader>();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Workspace Users</CardTitle>
                <CardDescription>Users with access to this workspace</CardDescription>
            </CardHeader>
            <CardContent>
                {workspaceUsers.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Joined</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {workspaceUsers.map((workspaceUser) => (
                                <TableRow key={workspaceUser.id}>
                                    <TableCell className="font-medium">{workspaceUser.user?.username}</TableCell>
                                    <TableCell>{workspaceUser.user?.first_name} {workspaceUser.user?.last_name}</TableCell>
                                    <TableCell>{workspaceUser.user?.username}</TableCell>
                                    <TableCell>
                                        <Badge variant={workspaceUser.role === "owner" ? "default" : "outline"}>
                                            {workspaceUser.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{new Date(workspaceUser.created_at).toLocaleDateString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="py-4 text-center text-gray-500">
                        No users found for this workspace
                    </div>
                )}
            </CardContent>
        </Card>
    );
} 
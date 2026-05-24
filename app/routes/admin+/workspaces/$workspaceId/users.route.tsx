export { loader } from "./users.loader.server";

import { data as routeData, LoaderFunctionArgs, redirect, useLoaderData, Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/lib/database.types";

type WorkspaceUserRow = Tables<"workspace_users"> & {
  user?: Tables<"user"> | null;
};

type LoaderData = {
  workspaceUsers: WorkspaceUserRow[];
};

export default function WorkspaceUsers() {
    const { workspaceUsers } = useLoaderData<LoaderData>();

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <CardTitle>Workspace Users</CardTitle>
                        <CardDescription>Users with access to this workspace</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link to="../invite">Manage Access</Link>
                    </Button>
                </div>
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
                            {workspaceUsers.map((workspaceUser: WorkspaceUserRow) => (
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

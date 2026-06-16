import { Form, Link } from "react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { useFilterPagination } from "@/hooks/utils/useFilterPagination";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import type { Tables } from "@/lib/database.types";

import type { WorkspaceWithCampaigns } from "../admin.types";

type AdminUsersPanelProps = {
    users: Tables<"user">[] | null;
    workspaceUsers: Tables<"workspace_users">[] | null;
    workspaces: WorkspaceWithCampaigns[] | null;
};

export function AdminUsersPanel({ users, workspaceUsers, workspaces }: AdminUsersPanelProps) {
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [filter, setFilter] = useState({
        search: "",
        accessLevel: "all",
    });
    const filterKey = `${filter.search}:${filter.accessLevel}`;
    const { currentPage, setCurrentPage } = useFilterPagination(filterKey);

    const filteredUsers =
        users?.filter((user) => {
            let matchesSearch = true;

            if (filter.search !== "") {
                const searchLower = filter.search.toLowerCase();
                matchesSearch = false;

                const username = typeof user.username === "string" ? user.username : "";
                if (username.toLowerCase().includes(searchLower)) {
                    matchesSearch = true;
                }

                const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
                if (fullName.toLowerCase().includes(searchLower)) {
                    matchesSearch = true;
                }

                const id = typeof user.id === "string" ? user.id : String(user.id || "");
                if (id.toLowerCase().includes(searchLower)) {
                    matchesSearch = true;
                }
            }

            const matchesAccessLevel =
                filter.accessLevel === "all" || user.access_level === filter.accessLevel;

            return matchesSearch && matchesAccessLevel;
        }) || [];

    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

    const accessLevels = Array.from(new Set(users?.map((u) => u.access_level).filter(Boolean))) || [];

    return (
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
                            <span className="text-sm text-muted-foreground">{filteredUsers.length} users</span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search users..."
                                    className="pl-8"
                                    value={filter.search}
                                    onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="w-[150px]">
                            <Select
                                value={filter.accessLevel}
                                onValueChange={(value) =>
                                    setFilter((prev) => ({ ...prev, accessLevel: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Access Level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Levels</SelectItem>
                                    {accessLevels.map((level) => (
                                        <SelectItem key={level} value={level || "standard"}>
                                            {level || "standard"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setFilter({ search: "", accessLevel: "all" })}
                        >
                            Clear Filters
                        </Button>
                    </div>

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
                                    const userWorkspaces =
                                        workspaceUsers?.filter((wu) => wu.user_id === userData.id) || [];
                                    const userWorkspaceDetails = userWorkspaces.map((uw) => {
                                        const workspace = workspaces?.find((w) => w.id === uw.workspace_id);
                                        return {
                                            ...uw,
                                            workspaceName: workspace?.name || "Unknown",
                                            workspaceId: workspace?.id,
                                        };
                                    });

                                    return (
                                        <TableRow key={userData.id}>
                                            <TableCell className="font-medium">{userData.username}</TableCell>
                                            <TableCell>
                                                {userData.first_name} {userData.last_name}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        userData.access_level === "sudo" ? "default" : "outline"
                                                    }
                                                >
                                                    {userData.access_level || "standard"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {userWorkspaceDetails.length > 0 ? (
                                                        userWorkspaceDetails.slice(0, 2).map((uwd) => (
                                                            <Badge
                                                                key={uwd.workspace_id}
                                                                variant="outline"
                                                                className="flex items-center gap-1"
                                                            >
                                                                {uwd.workspaceName}
                                                                <span className="text-xs opacity-70">
                                                                    ({uwd.role})
                                                                </span>
                                                            </Badge>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            No workspaces
                                                        </span>
                                                    )}
                                                    {userWorkspaceDetails.length > 2 && (
                                                        <Badge variant="outline">
                                                            +{userWorkspaceDetails.length - 2} more
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {new Date(userData.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link to={`/admin/users/${userData.id}/edit`}>
                                                            Edit User
                                                        </Link>
                                                    </Button>
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link to={`/admin/users/${userData.id}/workspaces`}>
                                                            Manage Workspaces
                                                        </Link>
                                                    </Button>
                                                    <Form method="post">
                                                        <input
                                                            type="hidden"
                                                            name="_action"
                                                            value="toggle_user_status"
                                                        />
                                                        <input type="hidden" name="userId" value={userData.id} />
                                                        <input type="hidden" name="currentStatus" value="false" />
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            type="submit"
                                                            className="text-red-500"
                                                        >
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

                    {filteredUsers.length > 0 && (
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
                                    Showing {startIndex + 1}-
                                    {Math.min(startIndex + itemsPerPage, filteredUsers.length)} of{" "}
                                    {filteredUsers.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
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
                                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
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
}

import { Form, NavLink } from "react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useFilterPagination } from "@/hooks/utils/useFilterPagination";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import {
    filterWorkspaceAdminRows,
    sortWorkspaceAdminRows,
    type WorkspaceAdminRow,
    type WorkspaceSortKey,
} from "@/lib/admin-workspaces";

type AdminWorkspacesPanelProps = {
    workspaceRows: WorkspaceAdminRow[];
};

export function AdminWorkspacesPanel({ workspaceRows }: AdminWorkspacesPanelProps) {
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [filter, setFilter] = useState<{
        search: string;
        status: "all" | "active" | "disabled";
        owner: string;
        opsState: "all" | "ready" | "attention" | "pending";
        sortKey: WorkspaceSortKey;
        sortDirection: "asc" | "desc";
    }>({
        search: "",
        status: "all",
        owner: "all",
        opsState: "all",
        sortKey: "created_at",
        sortDirection: "desc",
    });
    const filterKey = JSON.stringify(filter);
    const { currentPage, setCurrentPage } = useFilterPagination(filterKey);

    const filteredRows = useMemo(
        () =>
            filterWorkspaceAdminRows(workspaceRows, {
                search: filter.search,
                status: filter.status,
                owner: filter.owner,
                opsState: filter.opsState,
            }),
        [filter.owner, filter.opsState, filter.search, filter.status, workspaceRows],
    );

    const sortedRows = useMemo(
        () => sortWorkspaceAdminRows(filteredRows, filter.sortKey, filter.sortDirection),
        [filteredRows, filter.sortDirection, filter.sortKey],
    );

    const totalPages = Math.ceil(sortedRows.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedRows = sortedRows.slice(startIndex, startIndex + itemsPerPage);

    const workspaceOwners = useMemo(
        () =>
            workspaceRows
                .filter((row) => row.ownerUserId !== null)
                .map((row) => ({ id: row.ownerUserId as string, username: row.ownerUsername }))
                .filter((owner, index, owners) => owners.findIndex((item) => item.id === owner.id) === index)
                .sort((left, right) => left.username.localeCompare(right.username)),
        [workspaceRows],
    );

    return (
        <TabsContent value="workspaces">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Workspaces</CardTitle>
                            <CardDescription>
                                Scan workspace health, filter by ownership and ops state, and jump directly into admin flows.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Form method="post">
                                <input type="hidden" name="_action" value="sync_all_workspaces_twilio" />
                                <Button variant="outline" size="sm" type="submit">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync Twilio
                                </Button>
                            </Form>
                            <Button size="sm">Add Workspace</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex flex-wrap gap-3">
                        <div className="min-w-[240px] flex-1">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search name, ID, or owner..."
                                    className="pl-8"
                                    value={filter.search}
                                    onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="w-[160px]">
                            <Select
                                value={filter.status}
                                onValueChange={(value: "all" | "active" | "disabled") =>
                                    setFilter((prev) => ({ ...prev, status: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[180px]">
                            <Select
                                value={filter.owner}
                                onValueChange={(value) => setFilter((prev) => ({ ...prev, owner: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All owners</SelectItem>
                                    {workspaceOwners.map((owner) => (
                                        <SelectItem key={owner.id} value={owner.id}>
                                            {owner.username}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[180px]">
                            <Select
                                value={filter.opsState}
                                onValueChange={(value: "all" | "ready" | "attention" | "pending") =>
                                    setFilter((prev) => ({ ...prev, opsState: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Ops state" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All ops states</SelectItem>
                                    <SelectItem value="ready">Ready</SelectItem>
                                    <SelectItem value="attention">Attention</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[180px]">
                            <Select
                                value={filter.sortKey}
                                onValueChange={(value: WorkspaceSortKey) =>
                                    setFilter((prev) => ({ ...prev, sortKey: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="created_at">Created</SelectItem>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="credits">Credits</SelectItem>
                                    <SelectItem value="campaign_count">Campaigns</SelectItem>
                                    <SelectItem value="member_count">Members</SelectItem>
                                    <SelectItem value="phone_number_count">Phone numbers</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[140px]">
                            <Select
                                value={filter.sortDirection}
                                onValueChange={(value: "asc" | "desc") =>
                                    setFilter((prev) => ({ ...prev, sortDirection: value }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Direction" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="desc">Descending</SelectItem>
                                    <SelectItem value="asc">Ascending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setFilter({
                                    search: "",
                                    status: "all",
                                    owner: "all",
                                    opsState: "all",
                                    sortKey: "created_at",
                                    sortDirection: "desc",
                                })
                            }
                        >
                            Clear Filters
                        </Button>
                    </div>

                    <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{sortedRows.length} workspaces</span>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Credits</TableHead>
                                <TableHead>Members</TableHead>
                                <TableHead>Numbers</TableHead>
                                <TableHead>Campaigns</TableHead>
                                <TableHead>Twilio / Ops</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                                        No workspaces found matching your filters
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedRows.map((workspace) => (
                                    <TableRow key={workspace.id}>
                                        <TableCell>
                                            <div className="font-medium">{workspace.name}</div>
                                            <div className="font-mono text-xs text-muted-foreground">{workspace.id}</div>
                                        </TableCell>
                                        <TableCell>{workspace.ownerUsername}</TableCell>
                                        <TableCell>
                                            {workspace.disabled ? (
                                                <Badge variant="destructive">Disabled</Badge>
                                            ) : (
                                                <Badge variant="secondary">Active</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{workspace.credits}</TableCell>
                                        <TableCell>{workspace.memberCount}</TableCell>
                                        <TableCell>{workspace.phoneNumberCount}</TableCell>
                                        <TableCell>{workspace.campaignCount}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex flex-wrap gap-1">
                                                    <Badge
                                                        variant={
                                                            workspace.opsState === "attention"
                                                                ? "destructive"
                                                                : workspace.opsState === "pending"
                                                                  ? "outline"
                                                                  : "secondary"
                                                        }
                                                    >
                                                        {workspace.opsState}
                                                    </Badge>
                                                    <Badge variant="outline">{workspace.twilioSyncStatus}</Badge>
                                                    <Badge variant="outline">
                                                        {workspace.sendMode === "messaging_service"
                                                            ? "Messaging Service"
                                                            : "From number"}
                                                    </Badge>
                                                    <Badge variant="outline">{workspace.onboardingStatus}</Badge>
                                                    <Badge variant={workspace.voiceReady ? "secondary" : "outline"}>
                                                        {workspace.voiceReady ? "Voice ready" : "Voice review"}
                                                    </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {workspace.twilioLastSyncedAt
                                                        ? `Synced ${new Date(workspace.twilioLastSyncedAt).toLocaleString()}`
                                                        : "Never synced"}
                                                </div>
                                                {workspace.twilioLastSyncError && (
                                                    <div className="text-xs text-destructive">
                                                        {workspace.twilioLastSyncError}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(workspace.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" size="sm" asChild>
                                                    <NavLink to={`/admin/workspaces/${workspace.id}`}>Open</NavLink>
                                                </Button>
                                                <Button variant="outline" size="sm" asChild>
                                                    <NavLink to={`/admin/workspaces/${workspace.id}/twilio`}>
                                                        Twilio
                                                    </NavLink>
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Workspace actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem asChild>
                                                            <NavLink to={`/admin/workspaces/${workspace.id}/users`}>
                                                                Users
                                                            </NavLink>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <NavLink to={`/admin/workspaces/${workspace.id}/invite`}>
                                                                Access
                                                            </NavLink>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <Form method="post">
                                                            <input
                                                                type="hidden"
                                                                name="_action"
                                                                value="sync_workspace_twilio"
                                                            />
                                                            <input type="hidden" name="workspaceId" value={workspace.id} />
                                                            <DropdownMenuItem asChild>
                                                                <button type="submit" className="w-full text-left">
                                                                    Sync Twilio now
                                                                </button>
                                                            </DropdownMenuItem>
                                                        </Form>
                                                        <Form method="post">
                                                            <input
                                                                type="hidden"
                                                                name="_action"
                                                                value="toggle_workspace_status"
                                                            />
                                                            <input type="hidden" name="workspaceId" value={workspace.id} />
                                                            <input
                                                                type="hidden"
                                                                name="currentStatus"
                                                                value={workspace.disabled.toString()}
                                                            />
                                                            <DropdownMenuItem asChild>
                                                                <button type="submit" className="w-full text-left">
                                                                    {workspace.disabled
                                                                        ? "Enable workspace"
                                                                        : "Disable workspace"}
                                                                </button>
                                                            </DropdownMenuItem>
                                                        </Form>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {sortedRows.length > 0 && (
                        <div className="mt-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Select
                                    value={String(itemsPerPage)}
                                    onValueChange={(value) => setItemsPerPage(Number(value))}
                                >
                                    <SelectTrigger className="w-[120px]">
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
                                    {Math.min(startIndex + itemsPerPage, sortedRows.length)} of {sortedRows.length}
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
                                    {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = index + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = index + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + index;
                                        } else {
                                            pageNum = currentPage - 2 + index;
                                        }

                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setCurrentPage(pageNum)}
                                                className="h-8 w-8 p-0"
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

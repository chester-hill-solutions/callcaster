import { NavLink } from "react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminAsyncExportButton } from "@/components/campaign/home/CampaignHomeScreen/AdminAsyncExportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";

import type { CampaignWithWorkspace, WorkspaceWithCampaigns } from "../admin.types";

type AdminCampaignsPanelProps = {
    campaigns: CampaignWithWorkspace[];
    workspaces: WorkspaceWithCampaigns[] | null;
};

export function AdminCampaignsPanel({ campaigns, workspaces }: AdminCampaignsPanelProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [filter, setFilter] = useState({
        search: "",
        status: "all",
        type: "all",
        workspace: "all",
    });

    const filteredCampaigns = campaigns.filter((campaign) => {
        let matchesSearch = true;

        if (filter.search !== "") {
            const searchLower = filter.search.toLowerCase();
            matchesSearch = false;

            const title = typeof campaign.title === "string" ? campaign.title : "";
            if (title.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }

            const id = typeof campaign.id === "string" ? campaign.id : String(campaign.id || "");
            if (id.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }

            const workspaceName =
                campaign.workspace && typeof campaign.workspace.name === "string"
                    ? campaign.workspace.name
                    : "";
            if (workspaceName.toLowerCase().includes(searchLower)) {
                matchesSearch = true;
            }
        }

        const matchesStatus = filter.status === "all" || campaign.status === filter.status;
        const matchesType = filter.type === "all" || campaign.type === filter.type;
        const matchesWorkspace =
            filter.workspace === "all" ||
            (campaign.workspace && campaign.workspace.id === filter.workspace);

        return matchesSearch && matchesStatus && matchesType && matchesWorkspace;
    });

    const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedCampaigns = filteredCampaigns.slice(startIndex, startIndex + itemsPerPage);

    const campaignTypes = Array.from(new Set(campaigns.map((c) => c.type).filter(Boolean)));
    const campaignStatuses = Array.from(new Set(campaigns.map((c) => c.status).filter(Boolean)));

    useEffect(() => {
        setCurrentPage(1);
    }, [filter]);

    return (
        <TabsContent value="campaigns">
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Campaign Management</CardTitle>
                            <CardDescription>
                                Monitor and manage campaigns across all workspaces
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                {filteredCampaigns.length} campaigns
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search campaigns..."
                                    className="pl-8"
                                    value={filter.search}
                                    onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="w-[150px]">
                            <Select
                                value={filter.status}
                                onValueChange={(value) => setFilter((prev) => ({ ...prev, status: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {campaignStatuses.map((status) => (
                                        <SelectItem key={status} value={status || "Unknown"}>
                                            {status || "Unknown"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[150px]">
                            <Select
                                value={filter.type}
                                onValueChange={(value) => setFilter((prev) => ({ ...prev, type: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    {campaignTypes.map((type) => (
                                        <SelectItem key={type} value={type || "Unknown"}>
                                            {type || "Unknown"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-[200px]">
                            <Select
                                value={filter.workspace}
                                onValueChange={(value) => setFilter((prev) => ({ ...prev, workspace: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Workspace" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Workspaces</SelectItem>
                                    {workspaces?.map((workspace) => (
                                        <SelectItem key={workspace.id} value={workspace.id}>
                                            {workspace.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setFilter({ search: "", status: "all", type: "all", workspace: "all" })
                            }
                        >
                            Clear Filters
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead>Workspace</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Active</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedCampaigns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        No campaigns found matching your filters
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCampaigns.map((campaign) => (
                                    <TableRow key={campaign.id}>
                                        <TableCell className="font-medium">{campaign.title}</TableCell>
                                        <TableCell className="font-mono text-xs">{campaign.id}</TableCell>
                                        <TableCell>{campaign.workspace?.name || "Unknown"}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{campaign.type || "Unknown"}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    campaign.status === "running"
                                                        ? "secondary"
                                                        : campaign.status === "paused"
                                                          ? "outline"
                                                          : campaign.status === "draft"
                                                            ? "outline"
                                                            : "secondary"
                                                }
                                            >
                                                {campaign.status || "Unknown"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {campaign.is_active ? (
                                                <Badge variant="secondary">Active</Badge>
                                            ) : (
                                                <Badge variant="outline">Inactive</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(campaign.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" size="sm" asChild>
                                                    <NavLink
                                                        to={`/workspaces/${campaign.workspace?.id}/campaigns/${campaign.id}`}
                                                    >
                                                        View
                                                    </NavLink>
                                                </Button>
                                                <AdminAsyncExportButton
                                                    campaignId={campaign.id}
                                                    workspaceId={campaign.workspace?.id}
                                                />
                                                <Button variant="outline" size="sm" className="text-red-500">
                                                    {campaign.is_active ? "Deactivate" : "Activate"}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {filteredCampaigns.length > 0 && (
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
                                    {Math.min(startIndex + itemsPerPage, filteredCampaigns.length)} of{" "}
                                    {filteredCampaigns.length}
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

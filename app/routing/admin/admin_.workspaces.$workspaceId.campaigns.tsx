import { LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

    // Get workspace details with campaigns
    const { data: workspace } = await supabaseClient
        .from("workspace")
        .select("*, campaign(*)")
        .eq("id", workspaceId)
        .single();

    if (!workspace) {
        throw redirect("/admin?tab=workspaces");
    }

    return json({ 
        workspace
    });
};

export default function WorkspaceCampaigns() {
    const { workspace } = useLoaderData<typeof loader>();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Campaigns</CardTitle>
                <CardDescription>Campaigns in this workspace</CardDescription>
            </CardHeader>
            <CardContent>
                {workspace.campaign && workspace.campaign.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {workspace.campaign.map((campaign) => (
                                <TableRow key={campaign.id}>
                                    <TableCell className="font-medium">{campaign.title}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {campaign.type || 'Unknown'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant={
                                                campaign.status === 'running' ? 'secondary' : 
                                                campaign.status === 'paused' ? 'outline' : 
                                                campaign.status === 'draft' ? 'outline' : 
                                                'secondary'
                                            }
                                        >
                                            {campaign.status || 'Unknown'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{new Date(campaign.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to={`/workspaces/${workspace.id}/campaigns/${campaign.id}`}>
                                                View
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="py-4 text-center text-gray-500">
                        No campaigns found for this workspace
                    </div>
                )}
            </CardContent>
        </Card>
    );
} 